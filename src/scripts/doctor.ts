// Checks the whole backend setup and says what to fix. Run with `npm run doctor`.
import fs from 'node:fs';
import path from 'node:path';
import { formatReport, hasFailures, runDoctor } from '../lib/doctor/checks';
import { lockState } from '../lib/pipeline/lock';
import { createLlmClient } from '../lib/pipeline/llm-factory';
import { findStaleTemps } from '../lib/pipeline/publish';
import { fetchPage } from '../lib/pipeline/wikipedia';
import { createRepository } from '../lib/stories/get-repository';

async function main(): Promise<number> {
  const cwd = process.cwd();

  const results = await runDoctor({
    nodeVersion: process.versions.node,
    env: process.env,
    cwd,
    envFileExists: fs.existsSync(path.join(cwd, '.env.local')),

    async pingWikipedia() {
      const page = await fetchPage('Venice', undefined, { retry: { retries: 1, baseDelayMs: 1000 }, timeoutMs: 15000 });
      if (!page) throw new Error('Wikipedia answered, but without the expected page.');
    },

    // One tiny request proves the key is accepted and the model exists. (A small token limit keeps it cheap; Gemini
    // needs a little more room than Claude because its hidden thinking counts against the limit.)
    async pingLlm(config) {
      const client = createLlmClient(config, { maxTokens: config.provider === 'gemini' ? 512 : 16, timeoutMs: 30000, retry: { retries: 1, baseDelayMs: 1000 } });
      await client.complete('Reply with the single word OK.', 'ping');
    },

    openRepository: (choice) => createRepository(choice),
    fileHousekeeping: (dir) => ({ lock: lockState(dir), staleTemps: findStaleTemps(dir) }),
  });

  console.log(formatReport(results));
  return hasFailures(results) ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`The check itself failed: ${(err as Error).message}`);
    process.exitCode = 1;
  },
);

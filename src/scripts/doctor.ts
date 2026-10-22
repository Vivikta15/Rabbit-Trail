// Checks the whole backend setup and says what to fix. Run with `npm run doctor`.
import fs from 'node:fs';
import path from 'node:path';
import { formatReport, hasFailures, runDoctor } from '../lib/doctor/checks';
import { lockState } from '../lib/pipeline/lock';
import { createAnthropicClient } from '../lib/pipeline/llm-client';
import { findStaleTemps } from '../lib/pipeline/publish';
import { fetchPage } from '../lib/pipeline/wikipedia';
import { inspectStoriesDir } from '../lib/stories/catalog';

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

    // One tiny request (16 tokens) proves the key is accepted and the model exists.
    async pingAnthropic({ apiKey, model }) {
      const client = createAnthropicClient({ apiKey, model, maxTokens: 16, timeoutMs: 30000, retry: { retries: 1, baseDelayMs: 1000 } });
      await client.complete('Reply with the single word OK.', 'ping');
    },

    inspectDir: (dir) => inspectStoriesDir(dir),
    ensureWritable(dir) {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.write-test-${process.pid}`);
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
    },
    lockState: (dir) => lockState(dir),
    staleTempFiles: (dir) => findStaleTemps(dir),
  });

  console.log(formatReport(results));
  return hasFailures(results) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`The check itself failed: ${(err as Error).message}`);
    process.exit(1);
  },
);

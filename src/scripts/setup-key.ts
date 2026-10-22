// Saves your Anthropic API key to .env.local. Run with `npm run setup:key`.
// The key is typed or pasted at a hidden prompt, checked, and written to a gitignored file. It is never printed.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL, describeKey, validateApiKey } from '../lib/config/env';
import { isIgnoredByGit, saveKeyToEnvFile } from '../lib/config/env-file';
import { AuthError, PipelineAbort } from '../lib/pipeline/http';
import { createAnthropicClient } from '../lib/pipeline/llm-client';
import { readLine } from './prompt';

const MAX_TRIES = 3;

async function main(): Promise<number> {
  const root = process.cwd();
  const envFile = path.join(root, '.env.local');

  // Never write a secret into a file git would commit.
  let gitignore = '';
  try {
    gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
  } catch {
    // no .gitignore at all is treated as "not ignored"
  }
  if (!isIgnoredByGit(gitignore, '.env.local')) {
    console.error('Refusing to continue: .env.local is not listed in .gitignore, so the key could be committed by accident.');
    console.error('Add the line ".env*.local" to .gitignore and run this again.');
    return 1;
  }

  console.log('Paste your Anthropic API key (from console.anthropic.com). You will not see it as you type.');
  let key: string | null = null;
  for (let attempt = 1; attempt <= MAX_TRIES && key === null; attempt++) {
    const checked = validateApiKey(await readLine('API key: ', true));
    if (checked.ok) key = checked.key;
    else console.error(`That did not work: ${checked.problem}${attempt < MAX_TRIES ? ' Try again.' : ''}`);
  }
  if (key === null) {
    console.error('No valid key entered. Nothing was saved.');
    return 1;
  }

  process.stdout.write('Checking the key with Anthropic... ');
  try {
    const model = (process.env.STORY_MODEL ?? '').trim() || DEFAULT_MODEL;
    await createAnthropicClient({ apiKey: key, model, maxTokens: 16, timeoutMs: 30000, retry: { retries: 1, baseDelayMs: 1000 } }).complete('Reply with the single word OK.', 'ping');
    console.log('accepted.');
  } catch (err) {
    if (err instanceof AuthError) {
      console.log('rejected.');
      console.error('Anthropic does not accept this key, so it was not saved. Check it at console.anthropic.com and try again.');
      return 1;
    }
    if (err instanceof PipelineAbort) {
      // Not the key's fault (offline, busy, unknown model). The key itself is well-formed, so keep it.
      console.log('could not be checked right now.');
      console.error(`Saving it anyway. (${err.message})`);
    } else {
      throw err;
    }
  }

  saveKeyToEnvFile(envFile, key);
  console.log(`Saved ${describeKey(key)} to .env.local`);
  console.log('Next: run "npm run doctor" to check everything, then "npm run stories:generate".');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error((err as Error).message);
    process.exit(1);
  },
);

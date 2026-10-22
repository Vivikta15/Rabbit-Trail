// Saves your Anthropic API key to .env.local. Run with `npm run setup:key`.
// The key is typed or pasted at a hidden prompt, checked, and written to a gitignored file. It is never printed.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL, describeKey, validateApiKey } from '../lib/config/env';
import { isIgnoredByGit, saveKeyToEnvFile } from '../lib/config/env-file';
import { AuthError, PipelineAbort } from '../lib/pipeline/http';
import { createAnthropicClient } from '../lib/pipeline/llm-client';

const MAX_TRIES = 3;

function readSecret(prompt: string): Promise<string> {
  const stdin = process.stdin;

  // Input piped in (not a terminal): take the first line. Typing it at the prompt is safer, since a piped key
  // can end up in shell history.
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (data += chunk));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
    });
  }

  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let typed = '';
    const finish = (fn: () => void) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') return finish(() => reject(new Error('Cancelled. Nothing was saved.')));
        if (ch === '\r' || ch === '\n') return finish(() => resolve(typed));
        if (ch === '\u007f' || ch === '\b') {
          if (typed.length > 0) {
            typed = typed.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        typed += ch;
        process.stdout.write('*');
      }
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

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
    const checked = validateApiKey(await readSecret('API key: '));
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

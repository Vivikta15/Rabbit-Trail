// Saves an AI key to .env.local. Run `npm run setup:gemini` (Google Gemini) or `npm run setup:key` (Anthropic Claude).
// The key is typed or pasted at a hidden prompt, checked with the provider, and written to a gitignored file. It is
// never printed. The provider you set up last becomes the one the story generator uses.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL, describeKey, validateApiKey } from '../lib/config/env';
import { isIgnoredByGit, saveEnvValues } from '../lib/config/env-file';
import { DEFAULT_GEMINI_MODEL, describeGeminiKey, PROVIDER_LABEL, Provider, validateGeminiKey } from '../lib/config/provider';
import { AuthError, PipelineAbort } from '../lib/pipeline/http';
import { createLlmClient } from '../lib/pipeline/llm-factory';
import { readLine } from './prompt';

const MAX_TRIES = 3;

function chosenProvider(): Provider {
  const i = process.argv.indexOf('--provider');
  return i !== -1 && process.argv[i + 1] === 'gemini' ? 'gemini' : 'anthropic';
}

async function main(): Promise<number> {
  const provider = chosenProvider();
  const root = process.cwd();
  const envFile = path.join(root, '.env.local');
  const where = provider === 'gemini' ? 'aistudio.google.com/apikey' : 'console.anthropic.com';
  const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';

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

  console.log(`Paste your ${PROVIDER_LABEL[provider]} API key (from ${where}). You will not see it as you type.`);
  let key: string | null = null;
  for (let attempt = 1; attempt <= MAX_TRIES && key === null; attempt++) {
    const raw = await readLine('API key: ', true);
    const checked = provider === 'gemini' ? validateGeminiKey(raw) : validateApiKey(raw);
    if (checked.ok) key = checked.key;
    else console.error(`That did not work: ${checked.problem}${attempt < MAX_TRIES ? ' Try again.' : ''}`);
  }
  if (key === null) {
    console.error('No valid key entered. Nothing was saved.');
    return 1;
  }

  const model =
    provider === 'gemini'
      ? (process.env.GEMINI_MODEL ?? '').trim() || DEFAULT_GEMINI_MODEL
      : (process.env.STORY_MODEL ?? '').trim() || DEFAULT_MODEL;

  process.stdout.write(`Checking the key with ${provider === 'gemini' ? 'Google' : 'Anthropic'}... `);
  try {
    await createLlmClient(
      { provider, apiKey: key, model },
      { maxTokens: provider === 'gemini' ? 512 : 16, timeoutMs: 30000, retry: { retries: 1, baseDelayMs: 1000 } },
    ).complete('Reply with the single word OK.', 'ping');
    console.log('accepted.');
  } catch (err) {
    if (err instanceof AuthError) {
      console.log('rejected.');
      console.error(`${provider === 'gemini' ? 'Google' : 'Anthropic'} does not accept this key, so it was not saved. Check it at ${where} and try again.`);
      return 1;
    }
    if (err instanceof PipelineAbort) {
      // Not the key's fault (offline, busy, quota, unknown model). The key itself is well-formed, so keep it.
      console.log('could not be checked right now.');
      console.error(`Saving it anyway. (${err.message})`);
    } else {
      throw err;
    }
  }

  saveEnvValues(envFile, { [keyName]: key, LLM_PROVIDER: provider });
  console.log(`Saved ${provider === 'gemini' ? describeGeminiKey(key) : describeKey(key)} to .env.local, and chose ${PROVIDER_LABEL[provider]} for writing stories.`);
  console.log('Next: run "npm run doctor" to check everything.');
  return 0;
}

// Setting exitCode (instead of calling process.exit) lets the terminal handle close normally. process.exit while
// the keyboard handle is closing makes Node on Windows print "Assertion failed ... UV_HANDLE_CLOSING".
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  },
);

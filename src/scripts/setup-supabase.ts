// Saves your Supabase settings to .env.local. Run with `npm run setup:supabase`.
// The URL is typed normally; the secret key is entered at a hidden prompt. The key is checked against your project
// and written to a gitignored file. It is never printed.
import fs from 'node:fs';
import path from 'node:path';
import { describeServiceKey, validateServiceKey, validateSupabaseUrl } from '../lib/config/backend';
import { isIgnoredByGit, saveEnvValues } from '../lib/config/env-file';
import { DatabaseSchemaError } from '../lib/db/supabase-rest';
import { AuthError, PipelineAbort } from '../lib/pipeline/http';
import { createSupabaseRepository } from '../lib/stories/supabase-repository';
import { readLine } from './prompt';

const MAX_TRIES = 3;

async function ask<T>(prompt: string, hidden: boolean, check: (raw: string) => { ok: true; value: T } | { ok: false; problem: string }): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const result = check(await readLine(prompt, hidden));
    if (result.ok) return result.value;
    console.error(`That did not work: ${result.problem}${attempt < MAX_TRIES ? ' Try again.' : ''}`);
  }
  return null;
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

  console.log('In Supabase, open your project, then Project Settings -> API.');
  const url = await ask('Project URL (https://....supabase.co): ', false, (raw) => {
    const r = validateSupabaseUrl(raw);
    return r.ok ? { ok: true, value: r.url } : r;
  });
  if (url === null) {
    console.error('No valid URL entered. Nothing was saved.');
    return 1;
  }

  console.log('Now the SECRET key (Project Settings -> API Keys). You will not see it as you type.');
  const key = await ask('Secret key: ', true, (raw) => {
    const r = validateServiceKey(raw);
    return r.ok ? { ok: true, value: r.key } : r;
  });
  if (key === null) {
    console.error('No valid key entered. Nothing was saved.');
    return 1;
  }

  process.stdout.write('Checking your Supabase project... ');
  let migrationMissing = false;
  try {
    await createSupabaseRepository({ url, serviceKey: key, timeoutMs: 20000, retry: { retries: 1, baseDelayMs: 1000 } }).verify();
    console.log('connected and set up.');
  } catch (err) {
    if (err instanceof AuthError) {
      console.log('rejected.');
      console.error('Supabase does not accept this key for that project, so nothing was saved. Check both values and try again.');
      return 1;
    }
    if (err instanceof DatabaseSchemaError) {
      // The URL and key are fine; only the one-time database setup is missing. Keep them and say what is left.
      console.log('connected, but the database is not set up yet.');
      migrationMissing = true;
    } else if (err instanceof PipelineAbort) {
      console.log('could not be checked right now.');
      console.error(`Saving it anyway. (${err.message})`);
    } else {
      throw err;
    }
  }

  saveEnvValues(envFile, { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key });
  console.log(`Saved ${url} and ${describeServiceKey(key)} to .env.local`);

  if (migrationMissing) {
    console.log('');
    console.log('One step left: open the Supabase SQL Editor, paste in the contents of');
    console.log('  supabase/migrations/0001_stories.sql');
    console.log('and click Run. Then run "npm run doctor" to confirm.');
  } else {
    console.log('Next: run "npm run doctor" to check everything.');
  }
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

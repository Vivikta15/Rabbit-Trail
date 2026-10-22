// Server-only: picks the storage backend for this environment.
import { BackendChoice, chooseBackend } from '../config/backend';
import { SupabaseRestOptions } from '../db/supabase-rest';
import { createFileRepository } from './file-repository';
import { StoryRepository } from './repository';
import { createSupabaseRepository } from './supabase-repository';

export type RepositoryTuning = Partial<Pick<SupabaseRestOptions, 'fetchImpl' | 'retry' | 'timeoutMs'>>;

// A page or API request waits on the database while a reader watches, so it gives up quickly (one short retry, a
// hard time limit) and shows an error page. The daily generation job is patient instead, because nobody is waiting.
export const WEB_TUNING = { retry: { retries: 1, baseDelayMs: 300, maxDelayMs: 1000 }, timeoutMs: 8000 };

export function createRepository(choice: BackendChoice, tuning: RepositoryTuning = {}): StoryRepository {
  if (choice.kind === 'error') throw new Error(choice.problems.join(' '));
  return choice.kind === 'supabase'
    ? createSupabaseRepository({ url: choice.url, serviceKey: choice.serviceKey, ...tuning })
    : createFileRepository(choice.dir);
}

// For pages and API routes. A misconfigured backend throws with what to fix, instead of quietly serving an empty
// or partial catalog.
export function getRepository(env: Record<string, string | undefined> = process.env, cwd: string = process.cwd()): StoryRepository {
  return createRepository(chooseBackend(env, cwd), WEB_TUNING);
}

import { Story } from '../../types';
import { StoryIndexEntry } from './daily-pick';

// Where stories live. The pipeline and the pages depend only on this, so the same code runs against local
// files (development, tests) and Supabase (production).

export class StoryExistsError extends Error {}

export interface StoriesReport {
  valid: Story[];
  problems: { file: string; reason: string }[]; // `file` is the file name or the record id
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  status: string;
  publishedId?: string | null;
  details: unknown;
}

export interface RepoLock {
  release(): Promise<void>; // safe to call twice
}

export interface StoryRepository {
  readonly kind: 'file' | 'supabase';
  describe(): string;
  // Every usable story, and a reason for each stored record that is not usable.
  list(): Promise<StoriesReport>;
  // One light entry per story (no body), oldest first. What the daily feed needs.
  listIndex(): Promise<StoryIndexEntry[]>;
  // One story, or null when it is missing, damaged, or the id is not a usable id.
  get(id: string): Promise<Story | null>;
  // Insert only: throws StoryExistsError rather than overwriting; refuses invalid stories and unsafe ids.
  save(story: Story): Promise<void>;
  // Lower-cased titles that can never become a story.
  loadRejected(): Promise<Set<string>>;
  recordRejection(title: string, reason: string, date: string): Promise<void>;
  // Throws PipelineAbort when another run holds it. A lock left by a dead run is taken over.
  acquireLock(): Promise<RepoLock>;
  // Clears leftovers from crashed runs; returns what it cleared.
  housekeeping(): Promise<string[]>;
  recordRun(summary: RunSummary): Promise<void>;
  // Proves the store is usable (reachable, writable, set up) without changing any data. Resolves with a one-line
  // description of what was checked, or rejects with a message saying what to fix.
  verify(): Promise<string>;
}

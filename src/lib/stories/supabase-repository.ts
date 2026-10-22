// Server-only: stories in a Supabase Postgres database, reached with the service key.
import { randomUUID } from 'node:crypto';
import { Story } from '../../types';
import { createSupabaseRest, DatabaseConflictError, SupabaseRestOptions } from '../db/supabase-rest';
import { PipelineAbort } from '../pipeline/http';
import { explainStoryProblem } from './catalog';
import { StoryIndexEntry } from './daily-pick';
import { RunSummary, StoriesReport, StoryExistsError, StoryRepository } from './repository';
import { SAFE_STORY_ID } from './story-id';
import { validateForSave } from './validate-for-save';

const LOCK_STALE_SECONDS = 30 * 60; // matches the file backend: a run that has gone half an hour is assumed dead
const BY_AGE = 'order=date.asc,id.asc';

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function createSupabaseRepository(options: SupabaseRestOptions): StoryRepository {
  const db = createSupabaseRest(options);

  return {
    kind: 'supabase',
    describe: () => `Supabase (${new URL(options.url).host})`,

    async list(): Promise<StoriesReport> {
      const report: StoriesReport = { valid: [], problems: [] };
      for (const row of await db.selectAll('stories', `select=id,data&${BY_AGE}`)) {
        const problem = explainStoryProblem(row.data);
        if (problem) report.problems.push({ file: String(row.id), reason: problem });
        else if (row.data.id !== row.id) report.problems.push({ file: String(row.id), reason: `the record id does not match the story id "${row.data.id}"` });
        else report.valid.push(row.data as Story);
      }
      return report;
    },

    // Only the summary columns: the feed must not download every full story to pick one.
    async listIndex(): Promise<StoryIndexEntry[]> {
      const rows = await db.selectAll('stories', `select=id,date,title,topic,era,source_title,related_topics&${BY_AGE}`);
      return rows
        .filter((r) => isStr(r.id) && isStr(r.date) && isStr(r.title) && isStr(r.source_title) && Array.isArray(r.related_topics))
        .map((r) => ({
          id: r.id,
          date: r.date,
          title: r.title,
          topic: String(r.topic ?? ''),
          era: String(r.era ?? ''),
          sourceTitle: r.source_title,
          relatedTopics: r.related_topics.filter((t: unknown) => typeof t === 'string'),
        }));
    },

    async get(id) {
      // Checked before the id goes anywhere near a query.
      if (!SAFE_STORY_ID.test(id)) return null;
      const rows = await db.select('stories', `select=data&id=eq.${encodeURIComponent(id)}&limit=1`);
      const data = rows[0]?.data;
      return data && explainStoryProblem(data) === null && data.id === id ? (data as Story) : null;
    },

    async save(story) {
      validateForSave(story);
      try {
        await db.insert('stories', {
          id: story.id,
          date: story.date,
          title: story.title,
          topic: story.topic,
          era: story.era,
          source_title: story.source.title,
          related_topics: story.relatedTopics,
          data: story,
        });
      } catch (err) {
        if (err instanceof DatabaseConflictError) throw new StoryExistsError(`Story "${story.id}" already exists (same id or same source page).`);
        throw err;
      }
    },

    async loadRejected() {
      const rows = await db.selectAll('rejected_topics', 'select=title_lower&order=title_lower.asc');
      return new Set(rows.map((r) => String(r.title_lower)));
    },

    async recordRejection(title, reason, date) {
      try {
        await db.insert('rejected_topics', { title_lower: title.trim().toLowerCase(), title, reason, date });
      } catch (err) {
        if (!(err instanceof DatabaseConflictError)) throw err; // already remembered: nothing to do
      }
    },

    async acquireLock() {
      const owner = randomUUID();
      const got = await db.rpc('acquire_generation_lock', { p_owner: owner, p_stale_seconds: LOCK_STALE_SECONDS });
      if (got !== true) {
        throw new PipelineAbort('Another story run is already in progress (the run lock in Supabase is held). If a run crashed, the lock frees itself after 30 minutes.');
      }
      let released = false;
      return {
        async release() {
          if (released) return;
          released = true;
          try {
            await db.rpc('release_generation_lock', { p_owner: owner });
          } catch {
            // A failed release only means the lock expires on its own; it must never fail a finished run.
          }
        },
      };
    },

    async housekeeping() {
      return [];
    },

    // Reads one row from every table and calls the release function with a made-up owner (which deletes nothing),
    // so a missing table, a missing function or a bad key shows up without touching real data or the run lock.
    async verify() {
      for (const [table, column] of [['stories', 'id'], ['rejected_topics', 'title_lower'], ['generation_lock', 'name'], ['generation_runs', 'id']]) {
        await db.select(table, `select=${column}&limit=1`);
      }
      await db.rpc('release_generation_lock', { p_owner: randomUUID() });
      return `connected to ${new URL(options.url).host}; the 4 tables and the lock functions are in place`;
    },

    async recordRun(summary: RunSummary) {
      await db.insert('generation_runs', {
        started_at: summary.startedAt,
        finished_at: summary.finishedAt,
        status: summary.status,
        published_id: summary.publishedId ?? null,
        details: summary.details ?? {},
      });
    },
  };
}

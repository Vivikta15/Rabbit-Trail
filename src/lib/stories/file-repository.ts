// Server-only: stories as JSON files in a folder. Used for local development and tests.
import fs from 'node:fs';
import path from 'node:path';
import { Story } from '../../types';
import { acquireLock } from '../pipeline/lock';
import { cleanStaleTemps, loadRejected, publishStory, recordRejection } from '../pipeline/publish';
import { explainStoryProblem, inspectStoriesDir, toIndexEntry } from './catalog';
import { RunSummary, StoryRepository } from './repository';
import { SAFE_STORY_ID } from './story-id';
import { validateForSave } from './validate-for-save';

export interface FileRepository extends StoryRepository {
  readonly dir: string;
}

export function createFileRepository(dir: string): FileRepository {
  return {
    kind: 'file',
    dir,
    describe: () => `local files in ${dir}`,

    async list() {
      return inspectStoriesDir(dir);
    },
    async listIndex() {
      return inspectStoriesDir(dir)
        .valid.map(toIndexEntry)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    },
    async get(id) {
      if (!SAFE_STORY_ID.test(id)) return null;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf-8'));
        return explainStoryProblem(parsed) === null && parsed.id === id ? (parsed as Story) : null;
      } catch {
        return null;
      }
    },
    async save(story) {
      validateForSave(story);
      publishStory(story, dir);
    },
    async loadRejected() {
      return loadRejected(dir);
    },
    async recordRejection(title, reason, date) {
      recordRejection(dir, title, reason, date);
    },
    async acquireLock() {
      const handle = acquireLock(dir);
      return { release: async () => handle.release() };
    },
    async housekeeping() {
      return cleanStaleTemps(dir);
    },
    async recordRun(summary: RunSummary) {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'runs.jsonl'), `${JSON.stringify(summary)}\n`, 'utf-8');
    },
    async verify() {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.write-test-${process.pid}`);
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
      return `${dir} exists and is writable`;
    },
  };
}

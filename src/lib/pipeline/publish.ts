import fs from 'node:fs';
import path from 'node:path';
import { Story } from '../../types';
import { StoryExistsError } from '../stories/repository';
import { assertSafeStoryId } from '../stories/story-id';

const REJECTED_FILE = 'rejected-topics.jsonl';

const TEMP_MAX_AGE_MS = 60 * 60 * 1000;

// The id becomes a file name, so it must never be able to point outside the folder.
// Written to a temp file and renamed, so a crash can never leave a half-written story for the feed to read.
export function publishStory(story: Story, dir: string): string {
  assertSafeStoryId(story.id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${story.id}.json`);
  if (fs.existsSync(file)) throw new StoryExistsError(`Story file already exists: ${file}`);

  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(story, null, 2), 'utf-8');
  fs.renameSync(temp, file);
  return file;
}

// A crash between writing and renaming can leave a .tmp file. Only old ones count: a recent one may belong to a
// run that is still writing.
export function findStaleTemps(dir: string, now: number = Date.now()): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'));
  } catch {
    return [];
  }
  return names.filter((name) => {
    try {
      return now - fs.statSync(path.join(dir, name)).mtimeMs > TEMP_MAX_AGE_MS;
    } catch {
      return false;
    }
  });
}

export function cleanStaleTemps(dir: string, now: number = Date.now()): string[] {
  const stale = findStaleTemps(dir, now);
  for (const name of stale) fs.rmSync(path.join(dir, name), { force: true });
  return stale;
}

export function recordRejection(dir: string, title: string, reason: string, date: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, REJECTED_FILE), `${JSON.stringify({ title, reason, date })}\n`, 'utf-8');
}

// Lower-cased titles of topics that can never become a story (missing page, declined by the model, duplicate).
export function loadRejected(dir: string): Set<string> {
  const rejected = new Set<string>();
  let content: string;
  try {
    content = fs.readFileSync(path.join(dir, REJECTED_FILE), 'utf-8');
  } catch {
    return rejected;
  }
  for (const line of content.split('\n')) {
    try {
      const entry = JSON.parse(line);
      if (typeof entry?.title === 'string') rejected.add(entry.title.trim().toLowerCase());
    } catch {
      // ignore blank or corrupt lines
    }
  }
  return rejected;
}

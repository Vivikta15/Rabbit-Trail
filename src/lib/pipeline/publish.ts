import fs from 'node:fs';
import path from 'node:path';
import { Story } from '../../types';

const REJECTED_FILE = 'rejected-topics.jsonl';

// Written to a temp file and renamed, so a crash can never leave a half-written story for the feed to read.
export function publishStory(story: Story, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${story.id}.json`);
  if (fs.existsSync(file)) throw new Error(`Story file already exists: ${file}`);

  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(story, null, 2), 'utf-8');
  fs.renameSync(temp, file);
  return file;
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

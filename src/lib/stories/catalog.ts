// Server-only: reads story files from disk. Never import this from a client component.
import fs from 'node:fs';
import path from 'node:path';
import { VERIFIED_STORIES } from '../../data/stories';
import { ARCHETYPES } from '../../data/archetypes';
import { Story } from '../../types';
import { StoryIndexEntry } from './daily-pick';

export function storiesDir(): string {
  return process.env.STORIES_DIR || path.join(process.cwd(), 'content', 'stories');
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// Strict on purpose: these files are written by a pipeline, and a half-formed story must never reach a reader.
export function isStory(value: unknown): value is Story {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, any>;

  if (![s.id, s.date, s.title, s.protagonist, s.topic, s.era, s.decisionContext, s.whatWeCantProve].every(isString)) return false;
  if (!s.source || !isString(s.source.title) || !isString(s.source.url)) return false;
  if (!isStringArray(s.relatedTopics)) return false;

  if (!Array.isArray(s.facts) || s.facts.length === 0) return false;
  if (!s.facts.every((f: any) => f && isString(f.claim) && isString(f.sourceTitle) && isString(f.sourceUrl) && typeof f.isVerified === 'boolean')) return false;

  const c = s.counterArgument;
  if (!c || !isString(c.thesis) || !isString(c.evidence) || !isString(c.unresolvedPoints)) return false;

  const variants = s.presentationVariants;
  if (!variants || typeof variants !== 'object') return false;
  return Object.keys(ARCHETYPES).every((id) => {
    const v = variants[id];
    return v && isString(v.hook) && isString(v.narrativePacing) && isString(v.introFraming) && isString(v.analogy);
  });
}

export function loadGeneratedStories(dir: string = storiesDir()): Story[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }

  const stories: Story[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      if (isStory(parsed)) stories.push(parsed);
    } catch {
      // An unreadable or malformed file is skipped; it must not take the whole feed down.
    }
  }
  return stories;
}

// The seed story first claims its id; a generated file can never shadow it or another story.
export function loadCatalog(dir: string = storiesDir()): Story[] {
  const seen = new Set<string>();
  const catalog: Story[] = [];
  for (const story of [...VERIFIED_STORIES, ...loadGeneratedStories(dir)]) {
    if (seen.has(story.id)) continue;
    seen.add(story.id);
    catalog.push(story);
  }
  return catalog.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function toIndexEntry(story: Story): StoryIndexEntry {
  return {
    id: story.id,
    date: story.date,
    title: story.title,
    topic: story.topic,
    era: story.era,
    sourceTitle: story.source.title,
    relatedTopics: story.relatedTopics,
  };
}

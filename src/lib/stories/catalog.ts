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

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// Links in a story are rendered into pages, so only plain web links are ever allowed (no javascript: or data:).
function isWebUrl(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  try {
    const protocol = new URL(v).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// The first thing wrong with a would-be story, in words, or null when it is sound. Strict on purpose: these
// files are written by a pipeline, and a half-formed story must never reach a reader.
export function explainStoryProblem(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'the story must be a JSON object';
  const s = value as Record<string, any>;

  if (!isString(s.id) || !SAFE_ID.test(s.id)) return 'id must be lowercase letters, digits and dashes';
  if (!isString(s.date) || !DATE.test(s.date)) return 'date must look like YYYY-MM-DD';
  for (const field of ['title', 'protagonist', 'topic', 'era', 'decisionContext', 'whatWeCantProve']) {
    if (!isString(s[field])) return `${field} must be a non-empty string`;
  }
  if (!s.source || !isString(s.source.title)) return 'source.title must be a non-empty string';
  if (!isWebUrl(s.source.url)) return 'source.url must be an http(s) link';
  if (!isStringArray(s.relatedTopics)) return 'relatedTopics must be a list of titles';

  if (!Array.isArray(s.facts) || s.facts.length === 0) return 'facts must be a non-empty list';
  for (const [i, f] of s.facts.entries()) {
    if (!f || !isString(f.claim)) return `facts[${i}].claim must be a non-empty string`;
    if (!isString(f.sourceTitle)) return `facts[${i}].sourceTitle must be a non-empty string`;
    if (!isWebUrl(f.sourceUrl)) return `facts[${i}].sourceUrl must be an http(s) link`;
    if (typeof f.isVerified !== 'boolean') return `facts[${i}].isVerified must be true or false`;
  }

  const c = s.counterArgument;
  for (const field of ['thesis', 'evidence', 'unresolvedPoints']) {
    if (!c || !isString(c[field])) return `counterArgument.${field} must be a non-empty string`;
  }

  const variants = s.presentationVariants;
  if (!variants || typeof variants !== 'object') return 'presentationVariants is missing';
  for (const id of Object.keys(ARCHETYPES)) {
    const v = variants[id];
    if (!v || !isString(v.hook) || !isString(v.narrativePacing) || !isString(v.introFraming) || !isString(v.analogy)) {
      return `presentationVariants.${id} is missing or incomplete`;
    }
  }
  return null;
}

export function isStory(value: unknown): value is Story {
  return explainStoryProblem(value) === null;
}

export interface StoriesDirReport {
  valid: Story[];
  problems: { file: string; reason: string }[];
}

// Reads every story file and says which are usable and why the others are not. The feed ignores bad files; this
// is how a person finds out about them.
export function inspectStoriesDir(dir: string = storiesDir()): StoriesDirReport {
  const report: StoriesDirReport = { valid: [], problems: [] };
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return report;
  }

  const firstFileForId = new Map<string, string>();
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    } catch {
      report.problems.push({ file, reason: 'not valid JSON (a half-written or damaged file)' });
      continue;
    }
    const problem = explainStoryProblem(parsed);
    if (problem) {
      report.problems.push({ file, reason: problem });
      continue;
    }
    const story = parsed as Story;
    const earlier = firstFileForId.get(story.id);
    if (earlier) {
      report.problems.push({ file, reason: `duplicate story id "${story.id}" (already defined by ${earlier})` });
      continue;
    }
    firstFileForId.set(story.id, file);
    report.valid.push(story);
  }
  return report;
}

export function loadGeneratedStories(dir: string = storiesDir()): Story[] {
  return inspectStoriesDir(dir).valid;
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

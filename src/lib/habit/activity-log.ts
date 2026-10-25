import { calculateStreak, curiosityRadius } from './streak-calculator';

export const ACTIVITY_STORAGE_KEY = 'rabbit-trail:activity:v1';

export type ActivityEntry =
  | { type: 'story'; date: string; storyId: string; topic: string; era: string; readCounterArgument: boolean }
  | { type: 'connection'; date: string; conceptA: string; conceptB: string; hops: number; domains: string[] }
  | { type: 'favorite'; date: string; conceptA: string; conceptB: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TrailNode {
  label: string;
  kind: 'story' | 'connection';
  era?: string;
  firstVisited: string;
}

export interface ActivitySummary {
  streak: ReturnType<typeof calculateStreak>;
  storiesRead: number;
  counterArgumentReads: number;
  counterArgumentRatio: number;
  longestRabbitHole: number;
  curiosityRadius: number;
  favoriteConnections: { conceptA: string; conceptB: string }[];
  trail: TrailNode[];
}

export function localDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isActivityEntry(value: unknown): value is ActivityEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  if (typeof e.date !== 'string') return false;
  if (e.type === 'story') {
    return typeof e.storyId === 'string' && typeof e.topic === 'string' && typeof e.era === 'string' && typeof e.readCounterArgument === 'boolean';
  }
  if (e.type === 'connection') {
    return typeof e.conceptA === 'string' && typeof e.conceptB === 'string' && typeof e.hops === 'number' && Array.isArray(e.domains) && e.domains.every((d) => typeof d === 'string');
  }
  if (e.type === 'favorite') {
    return typeof e.conceptA === 'string' && typeof e.conceptB === 'string';
  }
  return false;
}

export function loadActivity(storage: StorageLike | null): ActivityEntry[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(ACTIVITY_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isActivityEntry) : [];
  } catch {
    return [];
  }
}

export function saveActivity(storage: StorageLike | null, log: ActivityEntry[]): void {
  if (!storage) return;
  try {
    storage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage can be full or blocked; the dashboard just won't remember this session.
  }
}

function sameEntry(a: ActivityEntry, b: ActivityEntry): boolean {
  if (a.type !== b.type || a.date !== b.date) return false;
  if (a.type === 'story' && b.type === 'story') return a.storyId === b.storyId;
  if (a.type === 'connection' && b.type === 'connection') return a.conceptA === b.conceptA && a.conceptB === b.conceptB;
  if (a.type === 'favorite' && b.type === 'favorite') return a.conceptA === b.conceptA && a.conceptB === b.conceptB;
  return false;
}

// A repeat of the same event on the same day is merged, never double counted.
export function appendEntry(log: ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  const index = log.findIndex((existing) => sameEntry(existing, entry));
  if (index === -1) return [...log, entry];

  const existing = log[index];
  if (existing.type === 'story' && entry.type === 'story' && entry.readCounterArgument && !existing.readCounterArgument) {
    return log.map((e, i) => (i === index ? entry : e));
  }
  return log;
}

export function summarizeActivity(log: ActivityEntry[], today: string): ActivitySummary {
  const stories = log.filter((e): e is Extract<ActivityEntry, { type: 'story' }> => e.type === 'story');
  const connections = log.filter((e): e is Extract<ActivityEntry, { type: 'connection' }> => e.type === 'connection');
  const counterArgumentReads = stories.filter((s) => s.readCounterArgument).length;

  const favorites = new Map<string, { conceptA: string; conceptB: string }>();
  log.forEach((e) => {
    if (e.type === 'favorite') favorites.set(`${e.conceptA}|${e.conceptB}`, { conceptA: e.conceptA, conceptB: e.conceptB });
  });

  const trail: TrailNode[] = [];
  const seen = new Set<string>();
  [...log]
    .filter((e) => e.type !== 'favorite')
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((e) => {
      const nodes =
        e.type === 'story'
          ? [{ label: e.topic, kind: 'story' as const, era: e.era }]
          : e.type === 'connection'
            ? e.domains.map((d) => ({ label: d, kind: 'connection' as const, era: undefined }))
            : [];
      nodes.forEach((n) => {
        if (seen.has(n.label)) return;
        seen.add(n.label);
        trail.push({ ...n, firstVisited: e.date });
      });
    });

  return {
    streak: calculateStreak(stories.map((s) => s.date), today),
    storiesRead: stories.length,
    counterArgumentReads,
    counterArgumentRatio: stories.length ? counterArgumentReads / stories.length : 0,
    longestRabbitHole: connections.reduce((max, c) => Math.max(max, c.hops), 0),
    curiosityRadius: curiosityRadius(stories.length, counterArgumentReads),
    favoriteConnections: Array.from(favorites.values()),
    trail,
  };
}

// Anonymous funnel counting, so a launch can say how many people came, from where, and how far they got.
//
// What is kept is deliberately small: the day, which step, a random id made in the browser, and the channel that sent
// the person. No address, no device details, no account, no email. The same person on the same day counts once per
// step, and a browser that asks not to be tracked (Do Not Track, Global Privacy Control) is never counted.
import { UUID } from '../accounts/jwt';

export const EVENT_NAMES = ['visit', 'quiz_started', 'quiz_completed', 'story_finished', 'signed_in', 'shared'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export interface EventInput {
  name: EventName;
  visitor: string;
  source: string;
}

const SOURCE = /^[a-z0-9][a-z0-9_-]{0,29}$/;

// A channel name is something like "reddit" or "hacker-news". Anything else is not trusted and is filed as "direct".
export function cleanSource(raw: unknown): string {
  if (typeof raw !== 'string') return 'direct';
  const value = raw.trim().toLowerCase();
  return SOURCE.test(value) ? value : 'direct';
}

// Links we share carry ?utm_source=<channel>. "ref" is accepted too, because some sites use it.
export function sourceFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  const utm = cleanSource(params.get('utm_source'));
  return utm !== 'direct' ? utm : cleanSource(params.get('ref'));
}

export function cleanEvent(raw: unknown): EventInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.name !== 'string' || !(EVENT_NAMES as readonly string[]).includes(input.name)) return null;
  if (typeof input.visitor !== 'string' || !UUID.test(input.visitor)) return null;
  return { name: input.name as EventName, visitor: input.visitor.toLowerCase(), source: cleanSource(input.source) };
}

export function shouldTrack(signals: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  const dnt = (signals.doNotTrack ?? '').toString().toLowerCase();
  if (dnt === '1' || dnt === 'yes') return false;
  return signals.globalPrivacyControl !== true;
}

export type FunnelRow = { source: string } & Record<EventName, number>;

const emptyRow = (source: string): FunnelRow => ({ source, visit: 0, quiz_started: 0, quiz_completed: 0, story_finished: 0, signed_in: 0, shared: 0 });

// Counts distinct people at each step, overall and per channel (busiest channel first).
export function summarizeEvents(rows: { name: string; visitor: string; source: string }[]): { bySource: FunnelRow[]; total: FunnelRow } {
  const seen = new Set<string>();
  const seenTotal = new Set<string>();
  const bySource = new Map<string, FunnelRow>();
  const total = emptyRow('all');

  for (const { name, visitor, source } of rows) {
    if (!(EVENT_NAMES as readonly string[]).includes(name)) continue;
    const step = name as EventName;
    if (!seenTotal.has(`${step}|${visitor}`)) {
      seenTotal.add(`${step}|${visitor}`);
      total[step] += 1;
    }
    if (!seen.has(`${source}|${step}|${visitor}`)) {
      seen.add(`${source}|${step}|${visitor}`);
      const row = bySource.get(source) ?? emptyRow(source);
      row[step] += 1;
      bySource.set(source, row);
    }
  }

  return { bySource: Array.from(bySource.values()).sort((a, b) => b.visit - a.visit || a.source.localeCompare(b.source)), total };
}

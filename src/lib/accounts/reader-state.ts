// What a signed-in reader has saved, and how a browser's copy is merged with the server's. Everything a browser sends
// is untrusted: it is cleaned before it is stored, and merging only ever adds (a history grows, a trial start can only
// move earlier). Whether a reader has paid is deliberately not part of this: only the server decides that.
import { ActivityEntry, appendEntry, isActivityEntry } from '../habit/activity-log';
import { parseSharedArchetype } from '../share/archetype-share';

export interface ReaderState {
  archetype: string | null;
  trialStartDate: string | null;
  activity: ActivityEntry[];
}

// Matches the limit in the database (0002_reader_state.sql).
export const MAX_ACTIVITY = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;

export const emptyReaderState = (): ReaderState => ({ archetype: null, trialStartDate: null, activity: [] });

function dayNumber(iso: unknown): number | null {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  // Round-trip, so 2026-02-30 is refused instead of silently becoming March.
  return new Date(ms).toISOString().slice(0, 10) === iso ? Math.round(ms / DAY_MS) : null;
}

// Newest last, so the oldest are the ones dropped when the history is too long.
function capActivity(activity: ActivityEntry[]): ActivityEntry[] {
  if (activity.length <= MAX_ACTIVITY) return activity;
  return [...activity].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_ACTIVITY);
}

export function cleanReaderState(raw: unknown, today: string): ReaderState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyReaderState();
  const input = raw as Record<string, unknown>;
  const now = dayNumber(today);
  if (now === null) return emptyReaderState();
  // Tomorrow is allowed, because a reader's day can be ahead of the server's.
  const latest = now + 1;

  let activity: ActivityEntry[] = [];
  if (Array.isArray(input.activity)) {
    for (const entry of input.activity) {
      if (!isActivityEntry(entry)) continue;
      const day = dayNumber(entry.date);
      if (day === null || day > latest) continue;
      activity = appendEntry(activity, entry);
    }
  }

  const trialDay = dayNumber(input.trialStartDate);
  const trialStartDate = trialDay === null ? null : trialDay > latest ? today : (input.trialStartDate as string);

  return {
    archetype: typeof input.archetype === 'string' ? parseSharedArchetype(input.archetype) : null,
    trialStartDate,
    activity: capActivity(activity),
  };
}

// `base` is the saved copy, `incoming` the browser's. Both are cleaned, so a bad saved row cannot poison the result.
export function mergeReaderStates(base: ReaderState, incoming: ReaderState, today: string): ReaderState {
  const a = cleanReaderState(base, today);
  const b = cleanReaderState(incoming, today);

  const activity = b.activity.reduce<ActivityEntry[]>((all, entry) => appendEntry(all, entry), a.activity);
  const trials = [a.trialStartDate, b.trialStartDate].filter((d): d is string => d !== null).sort();

  return {
    archetype: b.archetype ?? a.archetype,
    trialStartDate: trials[0] ?? null,
    activity: capActivity(activity),
  };
}

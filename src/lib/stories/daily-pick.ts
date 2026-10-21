// What the feed needs to know about a story. The full story stays on the server; the client only
// ever receives this index.
export interface StoryIndexEntry {
  id: string;
  date: string; // YYYY-MM-DD the story was added
  title: string;
  topic: string;
  era: string;
  sourceTitle: string;
  relatedTopics: string[];
}

export interface ReadRecord {
  storyId: string;
  date: string; // YYYY-MM-DD the reader finished it
}

export type DailyPick =
  | { kind: 'story'; storyId: string; reason: 'finished-today' | 'follows-trail' | 'next-unread' }
  | { kind: 'caught-up' };

const norm = (title: string) => title.trim().toLowerCase();

// How strongly a candidate connects to what the reader has read: one point for each read story that
// links to it, and one for each read story it links to. Links count in either direction.
function connection(candidate: StoryIndexEntry, readEntries: StoryIndexEntry[]): number {
  const candidateTitle = norm(candidate.sourceTitle);
  const candidateLinks = new Set(candidate.relatedTopics.map(norm));
  return readEntries.reduce((score, read) => {
    const readLinksToCandidate = read.relatedTopics.some((t) => norm(t) === candidateTitle);
    const candidateLinksToRead = candidateLinks.has(norm(read.sourceTitle));
    return score + (readLinksToCandidate ? 1 : 0) + (candidateLinksToRead ? 1 : 0);
  }, 0);
}

export function pickDailyStory(index: StoryIndexEntry[], reads: ReadRecord[], today: string): DailyPick {
  const known = new Map(index.map((e) => [e.id, e]));

  // Today's story is whatever the reader already finished today, so reloading never swaps it.
  const finishedToday = reads.find((r) => r.date === today && known.has(r.storyId));
  if (finishedToday) return { kind: 'story', storyId: finishedToday.storyId, reason: 'finished-today' };

  const readIds = new Set(reads.map((r) => r.storyId));
  const unread = index.filter((e) => !readIds.has(e.id));
  if (unread.length === 0) return { kind: 'caught-up' };

  const readEntries = reads.map((r) => known.get(r.storyId)).filter((e): e is StoryIndexEntry => e !== undefined);

  const ranked = unread
    .map((candidate) => ({ candidate, score: connection(candidate, readEntries) }))
    .sort((a, b) => b.score - a.score || a.candidate.date.localeCompare(b.candidate.date) || a.candidate.id.localeCompare(b.candidate.id));

  const best = ranked[0];
  return { kind: 'story', storyId: best.candidate.id, reason: best.score > 0 ? 'follows-trail' : 'next-unread' };
}

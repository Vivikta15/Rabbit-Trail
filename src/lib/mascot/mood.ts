// How the rabbit feels. Pure functions, so the rules are testable and the SVG component only draws.
//
// The rabbit is a soft nudge, never a punishment: a missed week makes it sad (never angry), and the "calm rabbit"
// setting removes the sad and angry faces altogether. Angry only appears as a joke when the included shields run out.

export const MOODS = ['curious', 'reading', 'cheering', 'detective', 'thrilled', 'happy', 'hopeful', 'sad', 'angry', 'calm'] as const;
export type Mood = (typeof MOODS)[number];
export type StreakMood = Extract<Mood, 'curious' | 'thrilled' | 'happy' | 'hopeful' | 'sad'>;

export const CALM_STORAGE_KEY = 'rabbit-trail:calm-rabbit:v1';
// Sent by the story page when a story is finished, so the rabbit can cheer.
export const CHEER_EVENT = 'rabbit:cheer';

const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

export interface StreakMoodInput {
  readingDates: string[]; // 'YYYY-MM-DD'
  today: string;
  // Shields used in the last week. Each one covers one missed day.
  shieldsUsed?: number;
}

// Looks at the last seven days up to yesterday (today is not a miss until it is over), ignoring days before the
// reader's first ever read. Each missed day not covered by a shield lowers the mood a step.
export function streakMood({ readingDates, today, shieldsUsed = 0 }: StreakMoodInput): StreakMood {
  const now = dayNumber(today);
  const read = new Set(readingDates.map(dayNumber).filter((n) => Number.isFinite(n) && n <= now));
  if (read.size === 0) return 'curious';

  const first = Math.min(...read);
  let missed = 0;
  for (let n = now - WINDOW_DAYS; n <= now - 1; n++) {
    if (n >= first && !read.has(n)) missed += 1;
  }

  const uncovered = Math.max(0, missed - Math.max(0, shieldsUsed));
  if (uncovered === 0) return shieldsUsed > 0 ? 'happy' : 'thrilled';
  if (uncovered === 1) return 'happy';
  if (uncovered === 2) return 'hopeful';
  return 'sad';
}

// Reading, exploring and onboarding have their own scenes; every other page shows how the streak is going.
export function moodForPath(pathname: string, streak: Mood): Mood {
  if (pathname.startsWith('/story/')) return 'reading';
  if (pathname.startsWith('/connections')) return 'detective';
  if (pathname.startsWith('/onboarding')) return 'curious';
  return streak;
}

export function softenMood(mood: Mood, calm: boolean): Mood {
  return calm && (mood === 'sad' || mood === 'angry') ? 'calm' : mood;
}

export function parseCalmSetting(raw: string | null | undefined): boolean {
  return raw === 'true';
}

const LINES: Record<Mood, string> = {
  curious: 'Ooh, what shall we learn about?',
  reading: "I'm reading along with you.",
  cheering: 'Another story on the trail!',
  detective: 'Following the clues...',
  thrilled: 'A flawless week. I am so happy!',
  happy: 'Lovely trail so far.',
  hopeful: "I'm here whenever you're ready.",
  sad: 'I missed you. One story is plenty.',
  angry: 'Out of shields! (I only puff up a little.)',
  calm: 'Whenever you like, no rush.',
};

export const mascotLine = (mood: Mood): string => LINES[mood];

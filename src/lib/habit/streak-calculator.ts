import { UserReadingProfile } from '../../types';

export function calculateStreak(
  readingDates: string[], // ISO date strings 'YYYY-MM-DD'
  referenceDateStr?: string
): {
  streakDays: number;
  isPaused: boolean;
  statusMessage: string;
} {
  if (!readingDates || readingDates.length === 0) {
    return {
      streakDays: 0,
      isPaused: false,
      statusMessage: 'Ready to begin your first rabbit trail!'
    };
  }

  // Sort unique dates ascending
  const uniqueDates = Array.from(new Set(readingDates)).sort();
  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0];
  const lastRead = uniqueDates[uniqueDates.length - 1];

  // Calculate day difference between today and last read
  const msPerDay = 1000 * 60 * 60 * 24;
  const todayMs = new Date(todayStr).getTime();
  const lastReadMs = new Date(lastRead).getTime();
  const daysDiff = Math.floor((todayMs - lastReadMs) / msPerDay);

  let streak = uniqueDates.length;
  let isPaused = false;
  let statusMessage = '';

  if (daysDiff === 0) {
    // Read today
    isPaused = false;
    // The streak counts reading days, not consecutive ones, so never claim it is unbroken.
    statusMessage = `Active Trail: ${streak} day${streak > 1 ? 's' : ''} and counting!`;
  } else if (daysDiff === 1) {
    // Read yesterday, pending today's read
    isPaused = false;
    statusMessage = `Ready for today's drop! Previous streak: ${streak} days.`;
  } else {
    // Missed 2+ days: NEVER RESET, PAUSE INSTEAD!
    isPaused = true;
    statusMessage = `Streak Paused at ${streak} days! No guilt here—pick right back up where you left off.`;
  }

  return {
    streakDays: streak,
    isPaused,
    statusMessage
  };
}

// Curiosity radius expands with counter-arguments and stories read
export function curiosityRadius(totalStoriesRead: number, counterArgumentReads: number): number {
  return Math.min(100, Math.round(totalStoriesRead * 8 + counterArgumentReads * 12));
}

export function updateCuriosityMetrics(
  currentProfile: UserReadingProfile,
  finishedStoryProps: { readCounterArgument: boolean; rabbitHoleStepsTraversed?: number }
): UserReadingProfile {
  const newCounterCount = currentProfile.counterArgumentReadCount + (finishedStoryProps.readCounterArgument ? 1 : 0);
  const newTotalRead = currentProfile.totalStoriesRead + 1;
  const newLongestHole = Math.max(currentProfile.longestRabbitHole, finishedStoryProps.rabbitHoleStepsTraversed || 0);

  return {
    ...currentProfile,
    totalStoriesRead: newTotalRead,
    counterArgumentReadCount: newCounterCount,
    longestRabbitHole: newLongestHole,
    curiosityRadius: curiosityRadius(newTotalRead, newCounterCount)
  };
}

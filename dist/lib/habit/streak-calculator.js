function calculateStreak(readingDates, referenceDateStr) {
  if (!readingDates || readingDates.length === 0) {
    return { streakDays: 0, isPaused: false, statusMessage: 'Ready to begin your first rabbit trail!' };
  }
  const uniqueDates = Array.from(new Set(readingDates)).sort();
  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0];
  const lastRead = uniqueDates[uniqueDates.length - 1];
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysDiff = Math.floor((new Date(todayStr).getTime() - new Date(lastRead).getTime()) / msPerDay);
  const streak = uniqueDates.length;

  if (daysDiff === 0) {
    return { streakDays: streak, isPaused: false, statusMessage: `Active Trail: ${streak} day unbroken!` };
  } else if (daysDiff === 1) {
    return { streakDays: streak, isPaused: false, statusMessage: `Ready for today's drop! Streak: ${streak} days.` };
  } else {
    // NEVER RESET TO ZERO!
    return {
      streakDays: streak,
      isPaused: true,
      statusMessage: `Streak Paused at ${streak} days! No guilt here—pick right back up where you left off.`
    };
  }
}

module.exports = { calculateStreak };

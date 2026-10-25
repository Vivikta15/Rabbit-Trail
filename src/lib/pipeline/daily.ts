// A scheduled run only needs to act when the day has no story yet, so it can safely be scheduled more than once a day:
// the first run that succeeds does the work and the later ones see that and stop without spending anything.
export function needsStoryToday(catalog: { date: string }[], today: string): boolean {
  return !catalog.some((s) => s.date === today);
}

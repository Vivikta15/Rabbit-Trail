import { Flame, Pause } from 'lucide-react';
import type { ActivitySummary } from '../../lib/habit/activity-log';

export default function StreakDisplay({ streak }: { streak: ActivitySummary['streak'] }) {
  const Icon = streak.isPaused ? Pause : Flame;
  const tone = streak.isPaused ? 'border-sky-600 text-sky-800' : 'border-amber-500/60 text-amber-700';

  return (
    <section aria-label="Reading streak" className={`rounded-2xl border bg-slate-900 p-6 ${tone}`}>
      <div className="flex items-center gap-4">
        <Icon size={36} aria-hidden />
        <div>
          <p className="text-5xl font-bold leading-none">{streak.streakDays}</p>
          <p className="mt-1 text-sm uppercase tracking-widest text-slate-400">
            {streak.isPaused ? 'days · paused' : streak.streakDays === 1 ? 'day' : 'days'}
          </p>
        </div>
      </div>
      <p className="mt-4 text-slate-300">{streak.statusMessage}</p>
    </section>
  );
}

'use client';

import { useCalmRabbit } from '../../hooks/use-mascot';
import { mascotLine, softenMood, StreakMood } from '../../lib/mascot/mood';
import CalmToggle from '../mascot/CalmToggle';
import Rabbit from '../mascot/Rabbit';

// The big rabbit on the dashboard, feeling however the streak is going.
export default function RabbitStreakCard({ mood }: { mood: StreakMood }) {
  const { calm } = useCalmRabbit();
  const shown = softenMood(mood, calm);

  return (
    <section aria-label="Your rabbit" className="flex items-center gap-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <Rabbit mood={shown} size={112} className="shrink-0" />
      <div>
        <p className="text-lg font-semibold text-amber-200">{mascotLine(shown)}</p>
        <CalmToggle className="mt-3" />
      </div>
    </section>
  );
}

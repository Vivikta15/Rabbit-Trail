'use client';

import { useMemo } from 'react';
import CuriosityMetrics from '../../components/dashboard/CuriosityMetrics';
import RabbitStreakCard from '../../components/dashboard/RabbitStreakCard';
import StreakDisplay from '../../components/dashboard/StreakDisplay';
import TrailMap from '../../components/dashboard/TrailMap';
import { useActivityLog } from '../../hooks/use-activity-log';
import { useStreakMood } from '../../hooks/use-mascot';
import { localDateString, summarizeActivity } from '../../lib/habit/activity-log';

export default function DashboardPage() {
  const { log } = useActivityLog();
  const mood = useStreakMood();
  const summary = useMemo(() => (log ? summarizeActivity(log, localDateString()) : null), [log]);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8 sm:py-12">
      <header>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Rabbit Trail</p>
        <h1 className="text-3xl font-bold">Your trail</h1>
        <p className="mt-2 text-slate-300">Missed a day? Your streak pauses. It never resets.</p>
      </header>

      {summary === null ? (
        <p className="text-slate-400">Loading your trail…</p>
      ) : (
        <>
          {mood && <RabbitStreakCard mood={mood} />}
          <StreakDisplay streak={summary.streak} />
          <CuriosityMetrics summary={summary} />
          <section aria-labelledby="trail-map-heading">
            <h2 id="trail-map-heading" className="mb-3 text-lg font-semibold">
              Trail map
            </h2>
            <TrailMap trail={summary.trail} />
          </section>
        </>
      )}
    </main>
  );
}

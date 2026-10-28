'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useActivityLog } from '../../hooks/use-activity-log';
import { loadArchetype } from '../../hooks/use-profile';
import { localDateString } from '../../lib/habit/activity-log';
import { pickDailyStory, StoryIndexEntry } from '../../lib/stories/daily-pick';

export default function TodayPicker({ index }: { index: StoryIndexEntry[] }) {
  const router = useRouter();
  const { log } = useActivityLog();
  const [caughtUp, setCaughtUp] = useState(false);

  useEffect(() => {
    if (!log) return;
    const reads = log.flatMap((e) => (e.type === 'story' ? [{ storyId: e.storyId, date: e.date }] : []));
    const pick = pickDailyStory(index, reads, localDateString());

    if (pick.kind === 'caught-up') {
      setCaughtUp(true);
      return;
    }
    router.replace(`/story/${pick.storyId}?archetype=${loadArchetype() ?? 'cartographer'}`);
  }, [log, index, router]);

  if (caughtUp) {
    return (
      <section className="space-y-3 text-center">
        <h1 className="text-2xl font-bold">You&apos;ve followed every trail we have</h1>
        <p className="text-slate-300">A new story arrives each day, chosen to follow where your curiosity has been heading.</p>
        <Link href="/dashboard" className="inline-block text-amber-700 underline">
          See your trail
        </Link>
      </section>
    );
  }

  return <p className="text-center text-slate-400">Finding your next story…</p>;
}

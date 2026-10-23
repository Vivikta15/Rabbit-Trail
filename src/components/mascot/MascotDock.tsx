'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCalmRabbit, useStreakMood } from '../../hooks/use-mascot';
import { CHEER_EVENT, mascotLine, moodForPath, softenMood } from '../../lib/mascot/mood';
import CalmToggle from './CalmToggle';
import Rabbit from './Rabbit';

const CHEER_MS = 4000;

// The rabbit that keeps the reader company on every page. The dashboard has its own larger rabbit, so this one steps aside there.
export default function MascotDock() {
  const pathname = usePathname() ?? '/';
  const streak = useStreakMood();
  const { calm } = useCalmRabbit();
  const [open, setOpen] = useState(false);
  const [cheering, setCheering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onCheer = () => {
      setCheering(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCheering(false), CHEER_MS);
    };
    window.addEventListener(CHEER_EVENT, onCheer);
    return () => {
      window.removeEventListener(CHEER_EVENT, onCheer);
      clearTimeout(timer.current);
    };
  }, []);

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/rabbit') || streak === null) return null;

  const mood = softenMood(cheering ? 'cheering' : moodForPath(pathname, streak), calm);

  return (
    <aside aria-label="Rabbit mascot" className="fixed bottom-3 right-3 z-30 flex flex-col items-end gap-2">
      {(open || cheering) && (
        <div role="status" className="max-w-[16rem] rounded-2xl border border-slate-700 bg-slate-900/95 p-3 text-sm text-slate-100 shadow-lg">
          <p>{mascotLine(mood)}</p>
          {open && <CalmToggle className="mt-2" />}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Hide the rabbit’s note' : 'Show the rabbit’s note'}
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <Rabbit mood={mood} size={68} />
      </button>
    </aside>
  );
}

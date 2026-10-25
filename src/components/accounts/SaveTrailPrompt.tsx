'use client';

import Link from 'next/link';
import { useReader } from './ReaderProvider';

// A gentle offer, shown only when sign-in is switched on and the reader has not signed in. Never blocks anything.
export default function SaveTrailPrompt() {
  const { status } = useReader();
  if (status !== 'signed-out') return null;

  return (
    <aside aria-label="Save your trail" className="rounded-2xl border border-amber-500/40 bg-slate-900 p-4 text-slate-200">
      <p className="font-semibold text-amber-300">Keep your trail safe</p>
      <p className="mt-1 text-sm text-slate-300">Sign in so your streak and stories follow you to any device, and are never lost if this browser is cleared.</p>
      <Link href="/account" className="mt-3 inline-block rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
        Save my trail
      </Link>
    </aside>
  );
}

'use client';

import Link from 'next/link';

// Shown instead of a blank screen when a page fails to render.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-slate-300">That page hit a problem. Your streak and trail are safe.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-cream hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
        >
          Try again
        </button>
        <Link href="/today" className="rounded-lg bg-slate-800 px-4 py-2 font-medium hover:bg-slate-700">
          Back to today
        </Link>
      </div>
    </main>
  );
}

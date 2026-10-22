import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">We couldn&apos;t find that</h1>
      <p className="text-slate-300">The page or story you asked for isn&apos;t here.</p>
      <Link href="/today" className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300">
        Back to today
      </Link>
    </main>
  );
}

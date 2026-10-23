import Rabbit from '../../components/mascot/Rabbit';
import { MOODS, mascotLine } from '../../lib/mascot/mood';

export const metadata = { title: 'Meet the rabbit · Rabbit Trail' };

export default function RabbitGalleryPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Rabbit Trail</p>
        <h1 className="text-3xl font-bold">Meet the rabbit</h1>
        <p className="mt-2 text-slate-300">Every face, and what it says. The rabbit is never angry about a missed day.</p>
      </header>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {MOODS.map((mood) => (
          <li key={mood} className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
            <Rabbit mood={mood} size={104} />
            <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-amber-300">{mood}</p>
            <p className="mt-1 text-sm text-slate-300">{mascotLine(mood)}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

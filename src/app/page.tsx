import Link from 'next/link';
import Rabbit from '../components/mascot/Rabbit';

const STEPS = [
  { title: 'Find your curiosity archetype', body: 'A one-minute quiz. Detective, Cartographer, Archaeologist and three more: it decides how each story opens.' },
  { title: 'Read one real story a day', body: 'A person, a decision, the facts with their sources, the strongest counter-argument, and what we can’t prove.' },
  { title: 'Follow your trail', body: 'Each story links onward, so your reading becomes a rabbit hole you chose. Miss a day and your streak pauses. It never resets.' },
];

const PRIMARY = 'block rounded-lg bg-amber-400 px-6 py-3 text-center font-semibold text-slate-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white';
const SECONDARY = 'block rounded-lg border border-slate-600 px-6 py-3 text-center font-medium text-slate-100 hover:border-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-12 px-4 py-10 sm:py-16">
      <header className="flex flex-col items-center text-center">
        <Rabbit mood="happy" size={104} />
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Rabbit Trail</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">One deeply sourced story a day, written the way your curiosity works.</h1>
        <p className="mt-4 text-lg text-slate-300">Real history, with the sources in view, and the other side of the argument. Every claim is checked against its source.</p>
        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:max-w-md sm:flex-row">
          <Link href="/onboarding" className={`${PRIMARY} flex-1`}>
            Find your archetype
          </Link>
          <Link href="/today" className={`${SECONDARY} flex-1`}>
            See today&apos;s story
          </Link>
        </div>
        <p className="mt-3 text-sm text-slate-400">Free for 7 days. No account needed to start.</p>
      </header>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="mb-4 text-2xl font-semibold">
          How it works
        </h2>
        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 font-bold text-slate-950" aria-hidden>
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-slate-300">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="made-heading" className="rounded-2xl border border-amber-500/40 bg-slate-900 p-5">
        <h2 id="made-heading" className="text-xl font-semibold text-amber-300">
          How the stories are made, honestly
        </h2>
        <p className="mt-2 text-slate-300">
          Stories are written with AI from Wikipedia articles. Nothing is published unless every quoted passage is found word for word in the source, and a second model confirms each claim says no more than its quote. Every story links to the exact version of the article it came from, so you can check us.
        </p>
      </section>

      <footer className="flex flex-col items-center gap-3 text-center">
        <Link href="/onboarding" className={`${PRIMARY} w-full max-w-sm`}>
          Start your trail
        </Link>
        <p className="text-sm text-slate-500">
          Counting is anonymous: a random id and the channel that sent you, nothing else. It stays off if your browser asks not to be tracked.
        </p>
      </footer>
    </main>
  );
}

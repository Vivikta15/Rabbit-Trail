import Link from 'next/link';
import PixelImage from '../components/pixel/PixelArt';
import PixelScene from '../components/pixel/PixelScene';
import { makeIcon } from '../lib/pixel/sprites';

const FEATURES = [
  { icon: 'lens', title: 'Pick your archetype', body: 'A one-minute quiz decides how every story opens: with the mystery, the map or the origin.' },
  { icon: 'book', title: 'One story a day', body: 'A real person and a real decision, with the facts, their sources and the other side.' },
  { icon: 'trail', title: 'Follow your trail', body: 'Each story links onward. Miss a day and your streak pauses. It never resets.' },
];

const STEPS = [
  { title: 'Find your curiosity archetype', body: 'Detective, Cartographer, Archaeologist and three more. It decides how each story is told to you.' },
  { title: 'Read one real story a day', body: 'A person, a decision, the facts with their sources, the strongest counter-argument, and what we can’t prove.' },
  { title: 'Follow your trail', body: 'Each story links onward, so your reading becomes a rabbit hole you chose. A rabbit keeps you company along the way.' },
];

const PRIMARY = 'block rounded-full bg-amber-400 px-7 py-3 text-center font-semibold text-cream hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700';
const SECONDARY = 'block rounded-full bg-slate-900 px-7 py-3 text-center font-medium text-slate-100 shadow-[0_3px_0_#9dbcab] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700';

export default function HomePage() {
  return (
    <main>
      <section className="relative isolate flex min-h-[calc(100svh-3.5rem)] flex-col overflow-hidden">
        <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pt-6 text-center sm:pt-10">
          <h1 className="pop-in text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">One deeply sourced story a day, written the way your curiosity works.</h1>
          <p className="pop-in mx-auto mt-4 max-w-xl text-slate-300" style={{ animationDelay: '0.1s' }}>
            Real history with the sources in view, and the other side of the argument. Every claim is checked against its source.
          </p>

          <ul className="mt-6 grid grid-cols-3 gap-3 text-center sm:mt-8 sm:gap-6">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="pop-in flex flex-col items-center" style={{ animationDelay: `${0.2 + i * 0.12}s` }}>
                <span className="flex h-14 items-end">
                  <PixelImage sprite={makeIcon(f.icon)} px={3} className="float-y" style={{ animationDelay: `${-i * 1.1}s` }} />
                </span>
                <h2 className="mt-2 text-xs font-bold sm:text-sm">{f.title}</h2>
                <p className="mt-1 hidden max-w-[16rem] text-xs leading-relaxed text-slate-300 sm:block">{f.body}</p>
              </li>
            ))}
          </ul>

          <div className="pop-in mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: '0.6s' }}>
            <Link href="/onboarding" className={`${PRIMARY} w-full max-w-xs sm:w-auto`}>
              Find your archetype →
            </Link>
            <Link href="/today" className={`${SECONDARY} w-full max-w-xs sm:w-auto`}>
              See today&apos;s story
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">Free for 7 days. No account needed to start.</p>
        </div>

        {/* The scene is taller than its box, so the trees and clouds rise behind the text above it. */}
        <div className="pointer-events-none relative mt-auto h-[190px] w-full sm:h-[240px] lg:h-[290px]">
          <PixelScene className="absolute inset-x-0 bottom-0 h-[290px] w-full sm:h-[380px] lg:h-[470px]" />
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl space-y-12 px-4 py-12 sm:py-16">
        <section aria-labelledby="how-heading">
          <h2 id="how-heading" className="mb-4 text-2xl font-bold">
            How it works
          </h2>
          <ol className="space-y-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="lift flex gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 font-bold text-cream" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-300">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="made-heading" className="lift rounded-2xl border border-amber-500/40 bg-slate-900 p-5">
          <h2 id="made-heading" className="text-xl font-bold text-amber-700">
            How the stories are made, honestly
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Stories are written with AI from Wikipedia articles. Nothing is published unless every quoted passage is found word for word in the source, and a second model confirms each claim says no more than its quote. Every story links to the exact version of the article it came from, so you can check us.
          </p>
        </section>

        <footer className="flex flex-col items-center gap-3 text-center">
          <Link href="/onboarding" className={`${PRIMARY} w-full max-w-sm`}>
            Start your trail
          </Link>
          <p className="text-xs text-slate-400">
            Counting is anonymous: a random id and the channel that sent you, nothing else. It stays off if your browser asks not to be tracked.
          </p>
        </footer>
      </div>
    </main>
  );
}

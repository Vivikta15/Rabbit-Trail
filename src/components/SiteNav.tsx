import Link from 'next/link';
import { makeRabbit } from '../lib/pixel/sprites';
import PixelImage from './pixel/PixelArt';

const LINKS = [
  { href: '/onboarding', label: 'Quiz' },
  { href: '/today', label: 'Today' },
  { href: '/connections', label: 'Connections' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/account', label: 'Account' },
];

// The rabbit's head, cropped from the mascot, as the logo.
const head = (() => {
  const full = makeRabbit('happy');
  return { ...full, height: 20, runs: full.runs.filter((r) => r.y < 20) };
})();

export default function SiteNav() {
  return (
    <nav aria-label="Main" className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-2">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-slate-100 hover:text-amber-700" aria-label="Rabbit Trail home">
          <PixelImage sprite={head} px={1} className="float-y" />
          <span className="hidden sm:inline">Rabbit Trail</span>
        </Link>
        <ul className="flex flex-1 gap-4 overflow-x-auto text-sm sm:justify-center">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="whitespace-nowrap py-2 text-slate-300 underline-offset-4 hover:text-amber-700 hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/onboarding"
          className="hidden shrink-0 rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-cream hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 md:block"
        >
          Start your trail →
        </Link>
      </div>
    </nav>
  );
}

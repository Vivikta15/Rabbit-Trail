import Link from 'next/link';
import { VERIFIED_STORIES } from '../data/stories';

const LINKS = [
  { href: '/onboarding', label: 'Quiz' },
  { href: `/story/${VERIFIED_STORIES[0].id}`, label: 'Story' },
  { href: '/connections', label: 'Connections' },
  { href: '/dashboard', label: 'Dashboard' },
];

export default function SiteNav() {
  return (
    <nav aria-label="Main" className="border-b border-slate-800">
      <ul className="mx-auto flex max-w-2xl gap-4 overflow-x-auto px-4 py-3 text-sm">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="whitespace-nowrap text-slate-300 hover:text-amber-300">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

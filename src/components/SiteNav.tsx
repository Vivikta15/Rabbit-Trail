import Link from 'next/link';

const LINKS = [
  { href: '/onboarding', label: 'Quiz' },
  { href: '/today', label: 'Today' },
  { href: '/connections', label: 'Connections' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/account', label: 'Account' },
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

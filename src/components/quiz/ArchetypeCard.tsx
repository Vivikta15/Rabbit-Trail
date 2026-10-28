'use client';

import { Compass, FlaskConical, Hourglass, LucideIcon, Map, Sparkles, Search } from 'lucide-react';
import { ARCHETYPES } from '../../data/archetypes';
import { archetypePath, archetypeShareText } from '../../lib/share/share';
import ShareButton from '../share/ShareButton';
import { ArchetypeId } from '../../types';

const ICONS: Record<string, LucideIcon> = {
  Map,
  Search,
  Hourglass,
  Sparkles,
  FlaskConical,
  Compass,
};

export default function ArchetypeCard({ archetypeId }: { archetypeId: ArchetypeId }) {
  const archetype = ARCHETYPES[archetypeId];
  const Icon = ICONS[archetype.iconName] ?? Compass;
  return (
    <article
      className="overflow-hidden rounded-2xl border bg-slate-900 shadow-xl"
      style={{ borderColor: archetype.accentColor }}
    >
      <div className="p-6 sm:p-8" style={{ background: `linear-gradient(160deg, ${archetype.accentColor}33, transparent 60%)` }}>
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: `${archetype.accentColor}33`, color: archetype.accentColor }}
        >
          <Icon size={28} aria-hidden />
        </div>
        <p className="text-xs uppercase tracking-widest text-slate-400">Your curiosity signature</p>
        <h2 className="mt-1 text-3xl font-bold">{archetype.name}</h2>
        <p className="mt-2 text-lg italic text-slate-300">{archetype.tagline}</p>
        <p className="mt-4 text-slate-300">{archetype.description}</p>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">Entry style</dt>
            <dd className="font-medium">{archetype.entryStyle}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Learning pace</dt>
            <dd className="font-medium">{archetype.learningPace}</dd>
          </div>
        </dl>

        <ul className="mt-6 flex flex-wrap gap-2">
          {archetype.traits.map((trait) => (
            <li
              key={trait}
              className="rounded-full border px-3 py-1 text-xs"
              style={{ borderColor: `${archetype.accentColor}88`, color: archetype.accentColor }}
            >
              {trait}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-slate-800 p-4 sm:px-8">
        <ShareButton path={archetypePath(archetypeId)} text={archetypeShareText(archetype.name)} label="Share my archetype" />
      </div>
    </article>
  );
}

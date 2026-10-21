'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { ARCHETYPES } from '../../data/archetypes';
import { recordActivity } from '../../hooks/use-activity-log';
import { localDateString } from '../../lib/habit/activity-log';
import type { PersonalizedStory } from '../../lib/llm/rewrite-engine';
import { ArchetypeId } from '../../types';
import SourceCitations from './SourceCitations';

interface Props {
  storyId: string;
  topic: string;
  era: string;
  initialArchetypeId: ArchetypeId;
  initialStory: PersonalizedStory;
}

export default function StoryViewer({ storyId, topic, era, initialArchetypeId, initialStory }: Props) {
  const [archetypeId, setArchetypeId] = useState(initialArchetypeId);
  const [story, setStory] = useState(initialStory);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const counterRef = useRef<HTMLElement>(null);
  const counterSeen = useRef(false);

  // The counter-argument counts as explored once it has scrolled into view.
  useEffect(() => {
    const check = () => {
      const el = counterRef.current;
      if (!el || counterSeen.current) return;
      const { top, bottom, height } = el.getBoundingClientRect();
      const visible = Math.min(bottom, window.innerHeight) - Math.max(top, 0);
      if (visible >= height * 0.6) counterSeen.current = true;
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  function finishStory() {
    recordActivity({
      type: 'story',
      date: localDateString(),
      storyId,
      topic,
      era,
      readCounterArgument: counterSeen.current,
    });
    setFinished(true);
  }

  async function switchArchetype(next: ArchetypeId) {
    setArchetypeId(next);
    setError(null);
    try {
      const res = await fetch(
        `/api/stories/personalized?storyId=${encodeURIComponent(storyId)}&archetype=${encodeURIComponent(next)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      setStory(await res.json());
    } catch {
      setError('Could not load that reading style. Please try again.');
    }
  }

  return (
    <article className="space-y-8">
      <div>
        <label htmlFor="archetype-switcher" className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
          Reading as
        </label>
        <select
          id="archetype-switcher"
          value={archetypeId}
          onChange={(e) => switchArchetype(e.target.value as ArchetypeId)}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:w-auto"
        >
          {Object.values(ARCHETYPES).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>

      <header>
        <h2 className="text-3xl font-bold leading-tight">{story.headline}</h2>
        <p className="mt-2 inline-flex items-center gap-1 text-sm text-slate-400">
          <Clock size={14} aria-hidden /> {story.readingMinutes} min read
        </p>
        <p className="mt-4 text-xl italic text-amber-300">{story.hook}</p>
      </header>

      <section className="space-y-4 text-slate-300">
        <p>{story.framing}</p>
        <p>{story.context}</p>
        <p>{story.pacing}</p>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Core factual foundation</h3>
        <SourceCitations facts={story.facts} />
      </section>

      <section>
        <h3 className="mb-2 text-lg font-semibold">The operational analogy</h3>
        <p className="text-slate-300">{story.analogy}</p>
      </section>

      <section ref={counterRef} className="rounded-xl border border-red-900/60 bg-red-950/30 p-5">
        <h3 className="mb-2 text-lg font-semibold text-red-300">The other side of the ledger</h3>
        <p>
          <strong>Counter-thesis:</strong> {story.counterArgument.thesis}
        </p>
        <p className="mt-2">
          <strong>The historical evidence:</strong> {story.counterArgument.evidence}
        </p>
        <p className="mt-2">
          <strong>What remains contested:</strong> {story.counterArgument.unresolvedPoints}
        </p>
      </section>

      <section className="rounded-xl border border-dashed border-slate-600 bg-slate-900 p-5">
        <h3 className="mb-2 text-lg font-semibold">What we can&apos;t prove</h3>
        <p className="text-slate-300">{story.whatWeCantProve}</p>
      </section>

      <footer>
        {finished ? (
          <p className="inline-flex items-center gap-2 text-emerald-300">
            <Check size={16} aria-hidden /> Added to your trail.{' '}
            <Link href="/dashboard" className="underline">
              View dashboard
            </Link>
          </p>
        ) : (
          <button
            type="button"
            onClick={finishStory}
            className="rounded-lg bg-amber-400 px-4 py-3 font-semibold text-slate-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            I&apos;ve finished this story
          </button>
        )}
      </footer>
    </article>
  );
}

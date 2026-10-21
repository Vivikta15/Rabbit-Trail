import { ExternalLink } from 'lucide-react';
import { StoryFact } from '../../types';

export default function SourceCitations({ facts }: { facts: StoryFact[] }) {
  return (
    <ol className="space-y-3">
      {facts.map((fact, index) => (
        <li key={fact.sourceUrl} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p>
            <span className="mr-2 font-semibold text-amber-400">{index + 1}.</span>
            {fact.claim}
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Source</summary>
            <a
              href={fact.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-start gap-1 text-amber-400 underline decoration-amber-400/40 hover:text-amber-300"
            >
              {fact.sourceTitle}
              <ExternalLink size={14} className="mt-0.5 shrink-0" aria-hidden />
            </a>
          </details>
        </li>
      ))}
    </ol>
  );
}

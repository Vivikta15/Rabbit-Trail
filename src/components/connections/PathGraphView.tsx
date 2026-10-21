import { ArrowDown } from 'lucide-react';
import { ConnectionTrail } from '../../types';

export default function PathGraphView({ trail }: { trail: ConnectionTrail }) {
  if (trail.hopsCount === 0) {
    return (
      <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-300">
        Both words point to the same concept: <strong>{trail.conceptA}</strong>. {trail.nodes[0].summary}
      </p>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-400">
        {trail.hopsCount} {trail.hopsCount === 1 ? 'hop' : 'hops'} from {trail.conceptA} to {trail.conceptB}
      </p>
      <ol>
        {trail.nodes.map((node, index) => {
          const step = trail.steps[index];
          return (
            <li key={node.id}>
              <div
                className="trail-reveal rounded-xl border border-slate-700 bg-slate-900 p-4"
                style={{ animationDelay: `${index * 250}ms` }}
              >
                <p className="text-xs uppercase tracking-widest text-amber-400">{node.domain}</p>
                <h3 className="mt-1 text-lg font-semibold">{node.title}</h3>
                <details className="mt-2 text-sm text-slate-300">
                  <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Rabbit hole</summary>
                  <p className="mt-2">{node.summary}</p>
                </details>
              </div>
              {step && (
                <div
                  className="trail-reveal my-2 ml-4 flex gap-3 border-l-2 border-amber-400/40 py-2 pl-4 text-sm"
                  style={{ animationDelay: `${index * 250 + 125}ms` }}
                >
                  <ArrowDown size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
                  <div>
                    <p className="font-medium">{step.relationship}</p>
                    <p className="mt-1 text-slate-300">{step.historicalOrScientificBasis}</p>
                    <p className="mt-1 text-xs italic text-slate-500">{step.sourceCitation}</p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

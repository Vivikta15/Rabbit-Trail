import type { ActivitySummary } from '../../lib/habit/activity-log';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="text-xs uppercase tracking-widest text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

export default function CuriosityMetrics({ summary }: { summary: ActivitySummary }) {
  const percent = Math.round(summary.counterArgumentRatio * 100);

  return (
    <section aria-label="Curiosity metrics" className="grid gap-3 sm:grid-cols-2">
      <Card title="Longest rabbit hole">
        <p className="mt-2 text-3xl font-bold">
          {summary.longestRabbitHole} <span className="text-base font-normal text-slate-400">{summary.longestRabbitHole === 1 ? 'hop' : 'hops'}</span>
        </p>
      </Card>

      <Card title="Curiosity radius">
        <p className="mt-2 text-3xl font-bold">
          {summary.curiosityRadius} <span className="text-base font-normal text-slate-400">/ 100</span>
        </p>
        <div
          role="progressbar"
          aria-label="Curiosity radius"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.curiosityRadius}
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
        >
          <div className="h-full bg-amber-400" style={{ width: `${summary.curiosityRadius}%` }} />
        </div>
      </Card>

      <Card title="Counter-arguments explored">
        <p className="mt-2 text-3xl font-bold">{percent}%</p>
        <p className="text-sm text-slate-400">
          {summary.counterArgumentReads} of {summary.storiesRead} {summary.storiesRead === 1 ? 'story' : 'stories'}
        </p>
      </Card>

      <Card title="Favorite connections">
        {summary.favoriteConnections.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Save a connection from the Connection Finder.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {summary.favoriteConnections.map((f) => (
              <li key={`${f.conceptA}|${f.conceptB}`}>
                {f.conceptA} <span className="text-slate-500">↔</span> {f.conceptB}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

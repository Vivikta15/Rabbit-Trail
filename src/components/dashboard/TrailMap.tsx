'use client';

import { useState } from 'react';
import type { TrailNode } from '../../lib/habit/activity-log';

const ROW = 90;
const WIDTH = 320;
const LEFT = 90;
const RIGHT = 230;

export default function TrailMap({ trail }: { trail: TrailNode[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  if (trail.length === 0) {
    return <p className="text-sm text-slate-400">Your trail map fills in as you read stories and follow connections.</p>;
  }

  const points = trail.map((_, i) => ({ x: i % 2 === 0 ? LEFT : RIGHT, y: 40 + i * ROW }));
  const height = 40 + (trail.length - 1) * ROW + 50;
  const active = selected === null ? null : trail[selected];

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="group" aria-label="Trail map" className="mx-auto w-full max-w-sm">
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#475569"
          strokeWidth={2}
          strokeDasharray="4 6"
        />
        {trail.map((node, i) => {
          const { x, y } = points[i];
          const color = node.kind === 'story' ? '#FBBF24' : '#38BDF8';
          const isActive = selected === i;
          const labelRight = x === LEFT;
          return (
            <g
              key={node.label}
              role="button"
              tabIndex={0}
              aria-label={`${node.label}, first visited ${node.firstVisited}`}
              aria-pressed={isActive}
              className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-white"
              onClick={() => setSelected(isActive ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(isActive ? null : i);
                }
              }}
            >
              <circle cx={x} cy={y} r={isActive ? 16 : 12} fill={color} stroke={isActive ? '#fff' : 'none'} strokeWidth={2} />
              <text
                x={labelRight ? x + 22 : x - 22}
                y={y + 4}
                textAnchor={labelRight ? 'start' : 'end'}
                fontSize={11}
                fill="#E2E8F0"
              >
                {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div aria-live="polite" className="mt-3 min-h-[3.5rem] rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
        {active ? (
          <>
            <p className="font-semibold">{active.label}</p>
            <p className="text-slate-400">
              {active.kind === 'story' ? `Story${active.era ? ` · ${active.era}` : ''}` : 'Connection'} · first visited {active.firstVisited}
            </p>
          </>
        ) : (
          <p className="text-slate-400">Select a stop to see when you first visited it.</p>
        )}
      </div>

      <p className="mt-2 flex gap-4 text-xs text-slate-400">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden />
          Story
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" aria-hidden />
          Connection
        </span>
      </p>
    </div>
  );
}

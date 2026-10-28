'use client';

import { usePathname } from 'next/navigation';
import { makeCloud, makeLeaf } from '../../lib/pixel/sprites';
import { PixelRuns } from './PixelArt';

// A faint sky behind every page except the landing page (which has its own scene): three clouds drifting and a few
// leaves falling. It sits behind the content, ignores the mouse, and is hidden from screen readers.
const clouds = [
  { sprite: makeCloud({ seed: 3, width: 48, height: 18 }), y: 12, seconds: 140, delay: 0 },
  { sprite: makeCloud({ seed: 8, width: 36, height: 14 }), y: 62, seconds: 180, delay: -90 },
  { sprite: makeCloud({ seed: 5, width: 56, height: 20 }), y: 112, seconds: 220, delay: -150 },
];
const leaves = [
  { x: 40, seconds: 26, delay: 0, seed: 0 },
  { x: 150, seconds: 31, delay: -12, seed: 1 },
  { x: 260, seconds: 28, delay: -20, seed: 2 },
];

export default function AmbientSky() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <svg
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMin slice"
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-60"
    >
      {clouds.map((c, i) => (
        <g key={i} transform={`translate(-60 ${c.y})`}>
          <g className="px-drift" style={{ animationDuration: `${c.seconds}s`, animationDelay: `${c.delay}s` }}>
            <PixelRuns sprite={c.sprite} />
          </g>
        </g>
      ))}
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} 0)`}>
          <g className="px-leaf" style={{ animationDuration: `${l.seconds}s`, animationDelay: `${l.delay}s` }}>
            <PixelRuns sprite={makeLeaf({ seed: l.seed })} />
          </g>
        </g>
      ))}
    </svg>
  );
}

import { makeCloud, makeFishingRabbit, makeFlower, makeGround, makeLeaf, makePine, makeTuft } from '../../lib/pixel/sprites';
import { SCENE } from '../../lib/theme/palette';
import { PixelRuns } from './PixelArt';

// The lakeside from the landing page: pines on two banks, a rabbit fishing, clouds drifting, water shimmering, leaves
// falling. Drawn at 320 x 120 "pixels" and scaled up. It is decoration only, and every movement stops for readers who
// ask for reduced motion (see globals.css).
const W = 320;
const H = 120;
const BANK_Y = 96; // the top of the grass
const WATER_Y = 101;

const clouds = [
  { sprite: makeCloud({ seed: 4, width: 52, height: 20 }), x: -60, y: 8, seconds: 150, delay: 0 },
  { sprite: makeCloud({ seed: 9, width: 40, height: 16 }), x: -60, y: 30, seconds: 110, delay: -60 },
  { sprite: makeCloud({ seed: 2, width: 60, height: 22 }), x: -60, y: 46, seconds: 190, delay: -120 },
  { sprite: makeCloud({ seed: 7, width: 36, height: 14 }), x: -60, y: 16, seconds: 130, delay: -30 },
];

// Left bank (x, height, seed) and right bank trees. Taller ones stand further back.
const leftTrees = [
  { x: 6, h: 62, w: 29, seed: 11, back: true },
  { x: 28, h: 48, w: 23, seed: 21, back: true },
  { x: 44, h: 38, w: 19, seed: 31, back: false },
  { x: -8, h: 52, w: 25, seed: 41, back: false },
];
const rightTrees = [
  { x: 288, h: 60, w: 29, seed: 12, back: true },
  { x: 266, h: 46, w: 23, seed: 22, back: true },
  { x: 236, h: 54, w: 25, seed: 32, back: false },
  { x: 214, h: 36, w: 19, seed: 42, back: false },
];

const rabbit = makeFishingRabbit();
const RABBIT = { x: 94, y: BANK_Y - rabbit.height + 3 };
const ROD_BASE = { x: RABBIT.x + 17, y: RABBIT.y + 14 };
const ROD_TIP = { x: 152, y: 46 };
const BOBBER = { x: 152, y: WATER_Y + 3 };

const leftBank = makeGround({ width: 128, seed: 5 });
const rightBank = makeGround({ width: 132, seed: 6 });

const shimmer = [
  [140, 108, 10], [160, 112, 8], [128, 114, 12], [176, 109, 9], [148, 117, 14], [190, 115, 8], [118, 110, 7], [170, 118, 11], [206, 112, 9], [100, 116, 10],
];
const leaves = [
  { x: 40, seconds: 17, delay: 0, seed: 0 },
  { x: 120, seconds: 22, delay: -9, seed: 1 },
  { x: 210, seconds: 19, delay: -4, seed: 2 },
  { x: 275, seconds: 24, delay: -14, seed: 0 },
  { x: 175, seconds: 20, delay: -7, seed: 1 },
];

const tree = (t: { x: number; h: number; w: number; seed: number }) => makePine({ seed: t.seed, width: t.w, height: t.h });

export default function PixelScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      className={className}
    >
      {/* clouds drifting across */}
      {clouds.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y})`}>
          <g className="px-drift" style={{ animationDuration: `${c.seconds}s`, animationDelay: `${c.delay}s` }}>
            <PixelRuns sprite={c.sprite} />
          </g>
        </g>
      ))}

      {/* the lake */}
      <rect x="0" y={WATER_Y} width={W} height={H - WATER_Y} fill={SCENE.lake} />
      <rect x="0" y={WATER_Y + 10} width={W} height={H - WATER_Y - 10} fill={SCENE.lakeDeep} />
      {shimmer.map(([x, y, w], i) => (
        <rect key={i} className="px-shimmer" x={x} y={y} width={w} height="1" fill={SCENE.lakeShine} style={{ animationDelay: `${(i * 0.7) % 4}s`, animationDuration: `${3 + (i % 3)}s` }} />
      ))}

      {/* trees: the back ones first so the front ones overlap them */}
      {[...leftTrees, ...rightTrees]
        .sort((a, b) => Number(b.back) - Number(a.back))
        .map((t, i) => (
          <g key={i} transform={`translate(${t.x} ${BANK_Y + 3 - t.h})`}>
            <g className="px-sway" style={{ animationDuration: `${5 + (i % 4)}s`, animationDelay: `${-i * 0.9}s` }}>
              <PixelRuns sprite={tree(t)} />
            </g>
          </g>
        ))}

      {/* the banks */}
      <PixelRuns sprite={leftBank} x={0} y={BANK_Y - 2} />
      <PixelRuns sprite={rightBank} x={W - 132} y={BANK_Y - 2} />

      {/* flowers and grass swaying on the banks */}
      {[[18, 0], [62, 1], [84, 2], [226, 1], [248, 0], [304, 2]].map(([x, seed], i) => (
        <g key={`f${i}`} transform={`translate(${x} ${BANK_Y - 7})`}>
          <g className="px-sway" style={{ animationDuration: `${3.5 + i * 0.4}s`, animationDelay: `${-i}s` }}>
            <PixelRuns sprite={makeFlower({ seed })} />
          </g>
        </g>
      ))}
      {[10, 52, 76, 112, 204, 232, 262, 296].map((x, i) => (
        <g key={`t${i}`} transform={`translate(${x} ${BANK_Y - 3})`}>
          <g className="px-sway" style={{ animationDuration: `${2.8 + (i % 3) * 0.6}s`, animationDelay: `${-i * 0.5}s` }}>
            <PixelRuns sprite={makeTuft({ seed: i + 1 })} />
          </g>
        </g>
      ))}

      {/* the rabbit, its rod, line and bobber */}
      <g className="px-breathe">
        <PixelRuns sprite={rabbit} x={RABBIT.x} y={RABBIT.y} />
        <rect className="px-blink" x={RABBIT.x + 15} y={RABBIT.y + 9} width="1.1" height="2.1" fill={SCENE.fur} />
      </g>
      <line x1={ROD_BASE.x} y1={ROD_BASE.y} x2={ROD_TIP.x} y2={ROD_TIP.y} stroke={SCENE.trunkDark} strokeWidth="1.2" />
      <line className="px-line" x1={ROD_TIP.x} y1={ROD_TIP.y} x2={BOBBER.x} y2={BOBBER.y} stroke={SCENE.outline} strokeWidth="0.4" />
      <g className="px-bob">
        <rect x={BOBBER.x - 1} y={BOBBER.y - 1} width="3" height="2" fill={SCENE.flower} />
        <rect x={BOBBER.x - 1} y={BOBBER.y - 2} width="3" height="1" fill="#ffffff" />
      </g>
      <ellipse className="px-ripple" cx={BOBBER.x} cy={BOBBER.y + 2} rx="5" ry="1" fill="none" stroke={SCENE.lakeShine} strokeWidth="0.6" />
      <ellipse className="px-ripple px-ripple-late" cx={BOBBER.x} cy={BOBBER.y + 2} rx="5" ry="1" fill="none" stroke={SCENE.lakeShine} strokeWidth="0.6" />

      {/* leaves falling */}
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

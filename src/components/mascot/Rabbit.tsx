import type { Mood } from '../../lib/mascot/mood';

type Eyes = 'open' | 'arc' | 'soft' | 'down';
type Mouth = 'smile' | 'grin' | 'frown' | 'flat' | 'small' | 'pout';
type Brows = 'none' | 'sad' | 'angry';
type Prop = 'phone' | 'magnifier' | 'sparkles' | 'tear' | 'anger' | null;

interface Face {
  eyes: Eyes;
  mouth: Mouth;
  brows: Brows;
  droop: boolean;
  blush: boolean;
  puffed: boolean;
  prop: Prop;
  tilt: number;
  motion: 'hop' | 'sway' | 'bob' | 'still';
}

const FACES: Record<Mood, Face> = {
  curious: { eyes: 'open', mouth: 'small', brows: 'none', droop: false, blush: false, puffed: false, prop: null, tilt: -6, motion: 'bob' },
  reading: { eyes: 'down', mouth: 'smile', brows: 'none', droop: false, blush: false, puffed: false, prop: 'phone', tilt: 0, motion: 'sway' },
  cheering: { eyes: 'arc', mouth: 'grin', brows: 'none', droop: false, blush: true, puffed: false, prop: 'sparkles', tilt: 0, motion: 'hop' },
  detective: { eyes: 'open', mouth: 'flat', brows: 'none', droop: false, blush: false, puffed: false, prop: 'magnifier', tilt: 4, motion: 'bob' },
  thrilled: { eyes: 'arc', mouth: 'grin', brows: 'none', droop: false, blush: true, puffed: false, prop: 'sparkles', tilt: 0, motion: 'hop' },
  happy: { eyes: 'open', mouth: 'smile', brows: 'none', droop: false, blush: true, puffed: false, prop: null, tilt: 0, motion: 'bob' },
  hopeful: { eyes: 'open', mouth: 'smile', brows: 'none', droop: false, blush: false, puffed: false, prop: null, tilt: 3, motion: 'bob' },
  sad: { eyes: 'open', mouth: 'frown', brows: 'sad', droop: true, blush: false, puffed: false, prop: 'tear', tilt: 0, motion: 'still' },
  angry: { eyes: 'open', mouth: 'pout', brows: 'angry', droop: false, blush: true, puffed: true, prop: 'anger', tilt: 0, motion: 'bob' },
  calm: { eyes: 'soft', mouth: 'smile', brows: 'none', droop: false, blush: true, puffed: false, prop: null, tilt: 0, motion: 'bob' },
};

const BODY = '#FDF6EC';
const EDGE = '#E4D3BB';
const PINK = '#F9A8C0';
const INK = '#1E293B';

const star = (x: number, y: number, delay: number) => (
  <path
    key={`${x}-${y}`}
    className="rabbit-twinkle"
    style={{ animationDelay: `${delay}s` }}
    transform={`translate(${x} ${y})`}
    d="M0,-6 L1.6,-1.6 L6,0 L1.6,1.6 L0,6 L-1.6,1.6 L-6,0 L-1.6,-1.6 Z"
    fill="#FBBF24"
  />
);

function Eye({ x, kind }: { x: number; kind: Eyes }) {
  if (kind === 'arc') return <path d={`M${x - 6} 68 Q${x} 59 ${x + 6} 68`} stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />;
  if (kind === 'soft') return <path d={`M${x - 6} 65 Q${x} 72 ${x + 6} 65`} stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />;
  const y = kind === 'down' ? 69 : 66;
  return (
    <g>
      <circle cx={x} cy={y} r="5.6" fill={INK} />
      <circle cx={x - 1.8} cy={y - 1.9} r="1.9" fill="#fff" />
      <circle cx={x + 1.6} cy={y + 1.8} r="0.9" fill="#fff" opacity="0.8" />
    </g>
  );
}

function Mouth({ kind }: { kind: Mouth }) {
  switch (kind) {
    case 'smile':
      return <path d="M52 80 Q60 88 68 80" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
    case 'grin':
      return <path d="M50 78 Q60 95 70 78 Z" fill="#9F1239" stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
    case 'frown':
      return <path d="M52 86 Q60 78 68 86" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
    case 'flat':
      return <path d="M53 83 Q60 85 67 82" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
    case 'small':
      return <ellipse cx="60" cy="83" rx="3" ry="3.6" fill={INK} />;
    case 'pout':
      return <path d="M54 85 Q60 80 66 85" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
  }
}

export default function Rabbit({ mood, size = 96, className = '' }: { mood: Mood; size?: number; className?: string }) {
  const f = FACES[mood];
  const earTilt = f.droop ? 72 : 8;

  return (
    <svg role="img" aria-label={`Rabbit mascot, feeling ${mood}`} width={size} height={(size * 134) / 120} viewBox="0 0 120 134" className={className}>
      <g className={`rabbit-${f.motion}`} style={{ transformOrigin: '60px 120px' }}>
        <g transform={`rotate(${f.tilt} 60 100)`}>
          {/* ears */}
          <g transform={`rotate(${-earTilt} 46 54)`}>
            <ellipse cx="46" cy="30" rx="9.5" ry="25" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
            <ellipse cx="46" cy="32" rx="4.8" ry="17" fill={PINK} />
          </g>
          <g transform={`rotate(${earTilt} 74 54)`}>
            <ellipse cx="74" cy="30" rx="9.5" ry="25" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
            <ellipse cx="74" cy="32" rx="4.8" ry="17" fill={PINK} />
          </g>

          {/* body and head */}
          <ellipse cx="60" cy="113" rx="30" ry="20" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
          <circle cx="60" cy="70" r="33" fill={BODY} stroke={EDGE} strokeWidth="1.5" />

          {f.puffed && (
            <>
              <circle cx="36" cy="79" r="8" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
              <circle cx="84" cy="79" r="8" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
            </>
          )}
          {f.blush && (
            <>
              <ellipse cx="38" cy="77" rx="6" ry="3.8" fill={PINK} opacity="0.65" />
              <ellipse cx="82" cy="77" rx="6" ry="3.8" fill={PINK} opacity="0.65" />
            </>
          )}

          {/* face */}
          <Eye x={46} kind={f.eyes} />
          <Eye x={74} kind={f.eyes} />
          {f.brows === 'sad' && (
            <g stroke={INK} strokeWidth="2.4" strokeLinecap="round">
              <path d="M39 59 L53 54" />
              <path d="M67 54 L81 59" />
            </g>
          )}
          {f.brows === 'angry' && (
            <g stroke={INK} strokeWidth="2.8" strokeLinecap="round">
              <path d="M39 54 L53 60" />
              <path d="M67 60 L81 54" />
            </g>
          )}
          <ellipse cx="60" cy="74" rx="3.2" ry="2.3" fill="#F48FB1" />
          <Mouth kind={f.mouth} />

          {/* props */}
          {f.prop === 'phone' && (
            <g>
              <rect x="47" y="97" width="26" height="34" rx="5" fill="#0F172A" stroke="#FBBF24" strokeWidth="2" />
              <rect x="50" y="101" width="20" height="24" rx="2.5" fill="#FBBF24" opacity="0.92" />
              <path d="M53 107 H67 M53 112 H65 M53 117 H67" stroke="#92400E" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="45" cy="113" r="5.5" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
              <circle cx="75" cy="113" r="5.5" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
            </g>
          )}
          {f.prop === 'magnifier' && (
            <g>
              <circle cx="92" cy="94" r="12" fill="#BAE6FD" fillOpacity="0.3" stroke="#FBBF24" strokeWidth="3.5" />
              <path d="M101 103 L111 115" stroke="#FBBF24" strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="88" cy="110" r="5.5" fill={BODY} stroke={EDGE} strokeWidth="1.5" />
            </g>
          )}
          {f.prop === 'sparkles' && (
            <g>
              {star(18, 34, 0)}
              {star(103, 28, 0.4)}
              {star(108, 66, 0.8)}
            </g>
          )}
          {f.prop === 'tear' && <path d="M45 76 Q41.5 82 45 85 Q48.5 82 45 76 Z" fill="#7DD3FC" />}
          {f.prop === 'anger' && (
            <g stroke="#F87171" strokeWidth="3" strokeLinecap="round" fill="none">
              <path d="M88 30 Q93 35 88 40" />
              <path d="M100 30 Q95 35 100 40" />
              <path d="M88 30 Q94 28 100 30" />
              <path d="M88 40 Q94 42 100 40" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

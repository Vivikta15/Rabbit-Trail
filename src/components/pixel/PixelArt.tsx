import type { PixelSprite } from '../../lib/pixel/canvas';

// Draws a sprite as SVG rectangles. Each rectangle bleeds a hair past its neighbour so no pale seams show when the art
// is scaled to a size that is not a whole number of screen pixels.
const BLEED = 0.03;

export function PixelRuns({ sprite, x = 0, y = 0, className, style }: { sprite: PixelSprite; x?: number; y?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <g transform={x || y ? `translate(${x} ${y})` : undefined} className={className} style={style}>
      {sprite.runs.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w + BLEED} height={1 + BLEED} fill={r.color} />
      ))}
    </g>
  );
}

// A sprite on its own, at a whole-number pixel size. With a label it is an image for screen readers; without, it is
// decoration and is hidden from them.
export default function PixelImage({ sprite, px = 3, label, className, style }: { sprite: PixelSprite; px?: number; label?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={sprite.width * px}
      height={sprite.height * px}
      viewBox={`0 0 ${sprite.width} ${sprite.height}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={style}
    >
      <PixelRuns sprite={sprite} />
    </svg>
  );
}

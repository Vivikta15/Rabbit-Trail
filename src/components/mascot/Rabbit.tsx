import { Mood } from '../../lib/mascot/mood';
import { makeRabbit } from '../../lib/pixel/sprites';
import PixelImage from '../pixel/PixelArt';

// The mascot, drawn in pixels. The faces are in lib/pixel/sprites.ts; this decides how it moves.
const MOTION: Record<Mood, 'hop' | 'sway' | 'bob' | 'still'> = {
  curious: 'bob',
  reading: 'sway',
  cheering: 'hop',
  detective: 'bob',
  thrilled: 'hop',
  happy: 'bob',
  hopeful: 'bob',
  sad: 'still',
  angry: 'bob',
  calm: 'bob',
};

const SPRITE_WIDTH = 26;

export default function Rabbit({ mood, size = 96, className = '' }: { mood: Mood; size?: number; className?: string }) {
  // Pixel art stays sharp only at a whole number of screen pixels per art pixel, so the size is rounded to that.
  const px = Math.max(2, Math.round(size / SPRITE_WIDTH));

  return (
    <PixelImage
      sprite={makeRabbit(mood)}
      px={px}
      label={`Rabbit mascot, feeling ${mood}`}
      className={`rabbit-${MOTION[mood]} ${className}`.trim()}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

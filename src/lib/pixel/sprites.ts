// The pixel-art pieces of the site: pines, clouds, ground, flowers, icons, the fishing rabbit and the mascot. Each is
// drawn with code from a seed, so it is repeatable and costs no image files.
import { MOODS, Mood } from '../mascot/mood';
import { SCENE } from '../theme/palette';
import { createRandom, PixelCanvas, PixelSprite } from './canvas';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ---- trees, clouds and ground ---------------------------------------------------------------------------------------------

export function makePine({ seed, width = 27, height = 44, tiers = 4 }: { seed: number; width?: number; height?: number; tiers?: number }): PixelSprite {
  const c = new PixelCanvas(width, height);
  const rnd = createRandom(seed);
  const cx = Math.floor(width / 2);
  const trunkHeight = 6;
  const foliageBottom = height - trunkHeight - 1;
  const widest = cx - 1; // leaves a pixel at each side for the outline

  for (let i = 0; i < tiers; i++) {
    const top = Math.round(1 + (i * (foliageBottom - 6)) / tiers);
    const bottom = i === tiers - 1 ? foliageBottom : Math.min(foliageBottom, Math.round(top + (foliageBottom - top) / (tiers - i) + 4));
    const maxHalf = Math.min(widest, Math.round(3 + ((i + 1) * ((width - 3) / 2 - 3)) / tiers));

    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / Math.max(1, bottom - top);
      let half = Math.round(1 + t * (maxHalf - 1));
      // A ragged edge, like needles, on most rows below the tip.
      if (y > top + 1 && rnd() < 0.35) half += rnd() < 0.5 ? -1 : 1;
      half = clamp(half, 1, maxHalf);

      for (let x = cx - half; x <= cx + half; x++) {
        const u = (x - cx) / Math.max(1, half);
        let color: string = u < -0.25 ? SCENE.pineLight : u > 0.35 ? SCENE.pineDark : SCENE.pineMid;
        // Speckles of the neighbouring shade, so a flat patch of green looks like foliage.
        if (rnd() < 0.14) color = color === SCENE.pineMid ? (rnd() < 0.5 ? SCENE.pineLight : SCENE.pineDark) : SCENE.pineMid;
        if (y <= top + 1 && Math.abs(u) < 0.6) color = SCENE.pineTip;
        if (y === bottom) color = SCENE.pineDark; // the shadow under each tier
        c.set(x, y, color);
      }
    }
  }

  for (let y = height - trunkHeight; y < height; y++) {
    c.set(cx - 1, y, SCENE.trunk);
    c.set(cx, y, SCENE.trunk);
    c.set(cx + 1, y, SCENE.trunkDark);
  }

  c.outline(SCENE.outline);
  return c.toSprite();
}

export function makeCloud({ seed, width = 44, height = 18 }: { seed: number; width?: number; height?: number }): PixelSprite {
  const c = new PixelCanvas(width, height);
  const rnd = createRandom(seed);

  c.ellipse(width / 2, height - 6, width / 2 - 2, 5, SCENE.cloud);
  const bumps = 3 + Math.floor(rnd() * 2);
  for (let k = 0; k < bumps; k++) {
    const x = 9 + (k * (width - 18)) / Math.max(1, bumps - 1) + (rnd() - 0.5) * 4;
    const y = height - 9 - rnd() * 2;
    const r = 4.5 + rnd() * 3;
    c.ellipse(x, y, r * 1.2, r, SCENE.cloud);
  }

  // A soft shade along the underside only: clouds here have no outline.
  const shade: [number, number][] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (c.get(x, y) !== null && (c.get(x, y + 1) === null || c.get(x, y + 2) === null)) shade.push([x, y]);
  }
  shade.forEach(([x, y]) => c.set(x, y, SCENE.cloudShade));
  return c.toSprite();
}

// A grassy bank: tufts on top, soil with pebbles below, outlined like the trees.
export function makeGround({ width, seed, height = 10 }: { width: number; seed: number; height?: number }): PixelSprite {
  const c = new PixelCanvas(width, height);
  const rnd = createRandom(seed);
  const left = 1;
  const right = width - 2;

  for (let x = left; x <= right; x++) {
    const tuft = rnd() < 0.3 ? 2 : rnd() < 0.55 ? 1 : 0;
    for (let k = 1; k <= tuft; k++) c.set(x, 3 - k, SCENE.grassDark);
    c.set(x, 3, SCENE.grassDark);
    c.set(x, 4, SCENE.grass);
    c.set(x, 5, SCENE.grass);
    for (let y = 6; y <= height - 2; y++) c.set(x, y, rnd() < 0.12 ? SCENE.soilDark : SCENE.soil);
    c.set(x, height - 2, SCENE.soilDark);
  }
  c.outline(SCENE.outline);
  return c.toSprite();
}

// ---- small things ---------------------------------------------------------------------------------------------------------

export function makeFlower({ seed }: { seed: number }): PixelSprite {
  const petals = [SCENE.flower, '#f19bb0', '#f6e3a1'][seed % 3];
  const c = new PixelCanvas(7, 9);
  for (let y = 4; y <= 8; y++) c.set(3, y, SCENE.grass);
  c.set(4, 6, SCENE.grass);
  c.set(5, 5, SCENE.grass);
  [[3, 0], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [4, 2], [5, 2], [2, 3], [3, 3], [4, 3]].forEach(([x, y]) => c.set(x, y, petals));
  c.set(3, 2, '#f1c85a');
  return c.toSprite();
}

export function makeTuft({ seed }: { seed: number }): PixelSprite {
  const c = new PixelCanvas(7, 5);
  const rnd = createRandom(seed);
  [0, 2, 3, 4, 6].forEach((x) => {
    const h = 2 + Math.floor(rnd() * 3);
    for (let y = 5 - h; y < 5; y++) c.set(x, y, y === 5 - h || x % 2 === 0 ? SCENE.grassDark : SCENE.grass);
  });
  return c.toSprite();
}

export function makeLeaf({ seed }: { seed: number }): PixelSprite {
  const color = ['#d98e4a', '#c4a24a', '#7fa392'][seed % 3];
  const c = new PixelCanvas(3, 3);
  [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]].forEach(([x, y]) => c.set(x, y, color));
  return c.toSprite();
}

export function makeIcon(name: string): PixelSprite {
  if (name === 'lens') {
    const c = new PixelCanvas(15, 15);
    c.ellipse(6.5, 6.5, 4.6, 4.6, SCENE.lakeShine);
    c.set(4, 4, '#ffffff');
    c.set(5, 3, '#ffffff');
    c.line(10, 10, 13, 13, SCENE.trunkDark);
    c.line(11, 10, 13, 12, SCENE.trunk);
    c.outline(SCENE.outline);
    return c.toSprite();
  }
  if (name === 'book') {
    const c = new PixelCanvas(16, 14);
    c.rect(1, 1, 14, 11, SCENE.sweater);
    c.rect(2, 2, 6, 9, SCENE.cloud);
    c.rect(8, 2, 6, 9, SCENE.cloud);
    c.rect(7, 2, 2, 9, SCENE.sweaterDark);
    [4, 6, 8].forEach((y) => {
      c.rect(3, y, 3, 1, SCENE.cloudShade);
      c.rect(10, y, 3, 1, SCENE.cloudShade);
    });
    c.outline(SCENE.outline);
    return c.toSprite();
  }
  if (name === 'trail') {
    // A dotted path winding uphill to a small flag.
    const c = new PixelCanvas(16, 14);
    // The dots are not outlined (an outline would join them into one dark band); the flag is, so it stands out.
    [[1, 12], [4, 11], [7, 10], [9, 8], [10, 6]].forEach(([x, y]) => c.rect(x, y, 2, 2, SCENE.trunk));
    const flag = new PixelCanvas(16, 14);
    flag.rect(12, 1, 1, 8, SCENE.trunkDark);
    flag.rect(13, 1, 3, 3, SCENE.sweater);
    flag.rect(13, 3, 2, 1, SCENE.sweaterDark);
    flag.outline(SCENE.outline);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) {
      const px = flag.get(x, y);
      if (px !== null) c.set(x, y, px);
    }
    return c.toSprite();
  }
  throw new Error(`Unknown icon "${name}"`);
}

// ---- the rabbit on the bank ---------------------------------------------------------------------------------------------

export function makeFishingRabbit(): PixelSprite {
  const c = new PixelCanvas(24, 26);
  const { fur, furShade, earInner, sweater, sweaterDark, eye } = SCENE;
  const [ox, oy] = [1, 1];
  const E = (cx: number, cy: number, rx: number, ry: number, color: string) => c.ellipse(cx + ox, cy + oy, rx, ry, color);
  const P = (x: number, y: number, color: string) => c.set(x + ox, y + oy, color);

  E(3.5, 17, 2.3, 2.3, fur); // tail
  E(9.5, 17, 6.2, 5.6, sweater); // body
  for (let x = 0; x < 24; x++) for (let y = 20; y < 24; y++) if (c.get(x, y + 1) === sweater) c.set(x, y + 1, sweaterDark);
  E(9.8, 3.4, 1.8, 4.4, fur); // ears
  E(14.2, 3.9, 1.8, 4.2, fur);
  E(9.8, 3.7, 0.8, 3, earInner);
  E(14.2, 4.2, 0.8, 2.8, earInner);
  E(12.4, 10, 5.7, 5.1, fur); // head
  P(14, 8, eye);
  P(14, 9, eye);
  P(18, 10, earInner); // nose
  P(13, 12, earInner); // cheek
  P(12, 13, furShade);
  c.line(11 + ox, 15 + oy, 16 + ox, 14 + oy, sweaterDark); // the arm reaching for the rod
  c.line(11 + ox, 16 + oy, 16 + ox, 15 + oy, sweaterDark);
  P(16, 13, fur);
  P(17, 14, fur);
  E(13, 22.4, 2.9, 1.4, fur); // feet
  E(7.2, 22.4, 2.6, 1.4, fur);

  c.outline(SCENE.outline);
  return c.toSprite();
}

// ---- the mascot, in pixels ---------------------------------------------------------------------------------------------

type Eyes = 'open' | 'arc' | 'soft' | 'down';
type Mouth = 'smile' | 'grin' | 'frown' | 'flat' | 'small' | 'pout';
type Brows = 'none' | 'sad' | 'angry';
type Prop = 'phone' | 'magnifier' | 'sparkles' | 'confetti' | 'tear' | 'anger' | null;

interface Face {
  eyes: Eyes;
  mouth: Mouth;
  brows: Brows;
  droop: boolean;
  blush: boolean;
  puffed: boolean;
  prop: Prop;
}

const FACES: Record<Mood, Face> = {
  curious: { eyes: 'open', mouth: 'small', brows: 'none', droop: false, blush: false, puffed: false, prop: null },
  reading: { eyes: 'down', mouth: 'smile', brows: 'none', droop: false, blush: false, puffed: false, prop: 'phone' },
  cheering: { eyes: 'arc', mouth: 'grin', brows: 'none', droop: false, blush: true, puffed: false, prop: 'confetti' },
  detective: { eyes: 'open', mouth: 'flat', brows: 'none', droop: false, blush: false, puffed: false, prop: 'magnifier' },
  thrilled: { eyes: 'arc', mouth: 'grin', brows: 'none', droop: false, blush: true, puffed: false, prop: 'sparkles' },
  happy: { eyes: 'open', mouth: 'smile', brows: 'none', droop: false, blush: true, puffed: false, prop: null },
  hopeful: { eyes: 'open', mouth: 'smile', brows: 'none', droop: false, blush: false, puffed: false, prop: null },
  sad: { eyes: 'open', mouth: 'frown', brows: 'sad', droop: true, blush: false, puffed: false, prop: 'tear' },
  angry: { eyes: 'open', mouth: 'pout', brows: 'angry', droop: false, blush: true, puffed: true, prop: 'anger' },
  calm: { eyes: 'soft', mouth: 'smile', brows: 'none', droop: false, blush: true, puffed: false, prop: null },
};

const MASCOT_WIDTH = 26;
const MASCOT_HEIGHT = 30;
const cache = new Map<Mood, PixelSprite>();

export function makeRabbit(mood: string): PixelSprite {
  if (!(MOODS as readonly string[]).includes(mood)) throw new Error(`Unknown mood "${mood}"`);
  const key = mood as Mood;
  const cached = cache.get(key);
  if (cached) return cached;

  const f = FACES[key];
  const c = new PixelCanvas(MASCOT_WIDTH, MASCOT_HEIGHT);
  const { fur, earInner, sweater, sweaterDark, eye, outline } = SCENE;
  // Everything is drawn on a 24 x 28 grid, one pixel in from the edge, so the outline always has room.
  const E = (cx: number, cy: number, rx: number, ry: number, color: string) => c.ellipse(cx + 1, cy + 1, rx, ry, color);
  const P = (x: number, y: number, color: string) => c.set(x + 1, y + 1, color);
  const R = (x: number, y: number, w: number, h: number, color: string) => c.rect(x + 1, y + 1, w, h, color);
  const both = (x: number, y: number, color: string) => {
    P(x, y, color);
    P(23 - x, y, color); // the same pixel on the other side of the face
  };

  // Ears: upright, or drooping out to the sides.
  if (f.droop) {
    E(4.5, 13, 4.8, 2.4, fur);
    E(19.5, 13, 4.8, 2.4, fur);
    E(4.7, 13, 3.3, 1, earInner);
    E(19.3, 13, 3.3, 1, earInner);
  } else {
    E(8, 6.5, 2.4, 6.5, fur);
    E(16, 6.5, 2.4, 6.5, fur);
    E(8, 7, 1, 4.5, earInner);
    E(16, 7, 1, 4.5, earInner);
  }

  E(12, 24, 7, 4.5, sweater); // the coral sweater
  for (let x = 0; x < MASCOT_WIDTH; x++) if (c.get(x, MASCOT_HEIGHT - 3) === sweater) c.set(x, MASCOT_HEIGHT - 3, sweaterDark);

  E(12, 15, 9, 7.5, fur); // head
  if (f.puffed) {
    E(4.5, 18, 2.4, 2.4, fur);
    E(19.5, 18, 2.4, 2.4, fur);
  }
  if (f.blush) {
    P(6, 18, earInner);
    P(7, 18, earInner);
    P(16, 18, earInner);
    P(17, 18, earInner);
  }

  // Eyes.
  if (f.eyes === 'open' || f.eyes === 'down') {
    const top = f.eyes === 'open' ? 14 : 15;
    [8, 14].forEach((x) => R(x, top, 2, 3, eye));
    if (f.eyes === 'open') [8, 14].forEach((x) => P(x, top, '#ffffff'));
  } else if (f.eyes === 'arc') {
    [[7, 15], [8, 14], [9, 14], [10, 15]].forEach(([x, y]) => both(x, y, eye));
  } else {
    [[7, 14], [8, 15], [9, 15], [10, 14]].forEach(([x, y]) => both(x, y, eye));
  }

  if (f.brows === 'sad') [[7, 12], [8, 11], [9, 11], [10, 10]].forEach(([x, y]) => both(x, y, eye));
  if (f.brows === 'angry') [[7, 10], [8, 11], [9, 11], [10, 12]].forEach(([x, y]) => both(x, y, eye));

  P(11, 18, earInner);
  P(12, 18, earInner);

  // Mouth.
  const mouth: Record<Mouth, [number, number][]> = {
    smile: [[10, 20], [11, 21], [12, 21], [13, 20]],
    grin: [[10, 20], [11, 20], [12, 20], [13, 20], [11, 21], [12, 21]],
    frown: [[10, 21], [11, 20], [12, 20], [13, 21]],
    flat: [[10, 20], [11, 20], [12, 20], [13, 20]],
    small: [[11, 20], [12, 20], [11, 21], [12, 21]],
    pout: [[10, 21], [11, 20], [12, 20], [13, 21]],
  };
  mouth[f.mouth].forEach(([x, y]) => P(x, y, eye));
  if (f.mouth === 'grin') [[11, 21], [12, 21]].forEach(([x, y]) => P(x, y, '#e0645e'));

  // What the rabbit is holding or showing.
  if (f.prop === 'tear') [[7, 17], [7, 18], [7, 19]].forEach(([x, y]) => P(x, y, '#7dd3fc'));
  if (f.prop === 'sparkles' || f.prop === 'confetti') {
    const star = (x: number, y: number, color: string) => [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => P(x + dx, y + dy, color));
    star(2, 3, '#f1c85a');
    star(21, 2, '#f1c85a');
    star(22, 11, '#f1c85a');
    if (f.prop === 'confetti') {
      star(1, 12, '#f19bb0');
      star(12, 1, '#8fb5b0');
      [[5, 1], [18, 5], [3, 7], [20, 8]].forEach(([x, y], i) => P(x, y, i % 2 ? '#e0645e' : '#7fa392'));
    }
  }
  if (f.prop === 'anger') [[19, 2], [21, 2], [20, 3], [19, 4], [21, 4]].forEach(([x, y]) => P(x, y, '#e0645e'));
  if (f.prop === 'phone') {
    R(8, 23, 8, 5, outline);
    R(9, 24, 6, 3, '#f1c85a');
    [[7, 25], [16, 25]].forEach(([x, y]) => P(x, y, fur));
  }
  if (f.prop === 'magnifier') {
    E(19.5, 23, 3.4, 3.4, SCENE.lakeShine);
    P(18, 21, '#ffffff');
    c.line(22, 26, 24, 28, SCENE.trunkDark);
    P(17, 25, fur);
  }

  c.outline(outline);
  const sprite = c.toSprite();
  cache.set(key, sprite);
  return sprite;
}

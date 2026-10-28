// A tiny pixel-art canvas. Shapes are drawn with code (rectangles, ellipses, lines, an outline pass) and seeded
// randomness, so a tree or a cloud looks hand-made but is exactly the same every time it is drawn, on the server and in
// the browser. The result is a list of horizontal runs, which the page draws as SVG rectangles.

export interface PixelRun {
  x: number;
  y: number;
  w: number;
  color: string;
}

export interface PixelSprite {
  width: number;
  height: number;
  runs: PixelRun[];
}

// A small, fast, repeatable random number generator (mulberry32).
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PixelCanvas {
  private readonly cells: (string | null)[];

  constructor(readonly width: number, readonly height: number) {
    this.cells = new Array(width * height).fill(null);
  }

  private inside(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): string | null {
    return this.inside(x, y) ? this.cells[y * this.width + x] : null;
  }

  set(x: number, y: number, color: string): void {
    if (this.inside(x, y)) this.cells[y * this.width + x] = color;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  // Fills every pixel whose centre lies inside the ellipse.
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
  }

  // Bresenham: one pixel per step along the longer side, with no gaps.
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, color);
      if (x === x1 && y === y1) return;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  // Wraps what is drawn in a one-pixel border: every empty cell that shares an edge with a drawn one.
  outline(color: string): void {
    const border: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x - 1, y) !== null || this.get(x + 1, y) !== null || this.get(x, y - 1) !== null || this.get(x, y + 1) !== null) border.push([x, y]);
      }
    }
    border.forEach(([x, y]) => this.set(x, y, color));
  }

  filledCount(): number {
    return this.cells.filter((c) => c !== null).length;
  }

  // Joins neighbours of one colour into a single run, so a big tree is hundreds of shapes, not thousands.
  toSprite(): PixelSprite {
    const runs: PixelRun[] = [];
    for (let y = 0; y < this.height; y++) {
      let x = 0;
      while (x < this.width) {
        const color = this.get(x, y);
        if (color === null) {
          x += 1;
          continue;
        }
        let end = x + 1;
        while (end < this.width && this.get(end, y) === color) end += 1;
        runs.push({ x, y, w: end - x, color });
        x = end;
      }
    }
    return { width: this.width, height: this.height, runs };
  }
}

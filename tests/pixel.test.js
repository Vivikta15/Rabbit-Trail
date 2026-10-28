const test = require('node:test');
const assert = require('node:assert/strict');

const { PixelCanvas, createRandom } = require('../dist/lib/pixel/canvas.js');
const { makePine, makeCloud, makeGround, makeFlower, makeTuft, makeLeaf, makeIcon, makeFishingRabbit, makeRabbit } = require('../dist/lib/pixel/sprites.js');
const { MOODS } = require('../dist/lib/mascot/mood.js');
const { SCENE } = require('../dist/lib/theme/palette.js');

// Turns a sprite's runs back into a map of "x,y" -> colour, so tests can compare what is really drawn.
function paint(sprite) {
  const m = new Map();
  for (const { x, y, w, color } of sprite.runs) for (let i = 0; i < w; i++) {
    const key = `${x + i},${y}`;
    assert.equal(m.has(key), false, `pixel ${key} is drawn twice`);
    m.set(key, color);
  }
  return m;
}
const colours = (sprite) => new Set(sprite.runs.map((r) => r.color));
const same = (a, b) => JSON.stringify(a.runs) === JSON.stringify(b.runs);

// ---- the canvas -----------------------------------------------------------------------------------------------------

test('Canvas - set and get, and anything outside the canvas is quietly ignored', () => {
  const c = new PixelCanvas(4, 3);
  c.set(1, 1, '#111111');
  c.set(-1, 0, '#222222');
  c.set(4, 0, '#222222');
  c.set(0, 3, '#222222');

  assert.equal(c.get(1, 1), '#111111');
  assert.equal(c.get(0, 0), null);
  assert.equal(c.get(-1, 0), null);
  assert.equal(c.filledCount(), 1);
});

test('Canvas - a rectangle fills exactly its area, and is clipped at the edges', () => {
  const c = new PixelCanvas(10, 10);
  c.rect(2, 3, 4, 2, '#aaaaaa');
  assert.equal(c.filledCount(), 8);

  const clipped = new PixelCanvas(5, 5);
  clipped.rect(3, 3, 10, 10, '#aaaaaa');
  assert.equal(clipped.filledCount(), 4);
});

test('Canvas - an ellipse is solid and mirror-symmetric', () => {
  const c = new PixelCanvas(12, 12);
  c.ellipse(6, 6, 4, 3, '#bbbbbb');

  assert.ok(c.filledCount() > 20);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    assert.equal(c.get(x, y) !== null, c.get(11 - x, y) !== null, `row ${y}: ${x} and ${11 - x} must match`);
  }
  for (let y = 0; y < 12; y++) {
    const row = [...Array(12).keys()].filter((x) => c.get(x, y));
    if (row.length) assert.equal(row[row.length - 1] - row[0] + 1, row.length, `row ${y} has a gap`);
  }
});

test('Canvas - a line reaches both ends and has no gaps', () => {
  const c = new PixelCanvas(20, 20);
  c.line(1, 1, 15, 8, '#cccccc');

  assert.ok(c.get(1, 1) && c.get(15, 8));
  assert.equal(c.filledCount(), 15, 'one pixel per step along the longer side');
});

test('Canvas - an outline wraps what is drawn, touching only empty cells that share an edge with it', () => {
  const c = new PixelCanvas(5, 5);
  c.set(2, 2, '#ffffff');
  c.outline('#000000');

  for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]]) assert.equal(c.get(x, y), '#000000');
  for (const [x, y] of [[1, 1], [3, 3], [1, 3], [3, 1]]) assert.equal(c.get(x, y), null, 'diagonals stay empty');
  assert.equal(c.get(2, 2), '#ffffff', 'the drawing itself is untouched');
});

test('Canvas - runs rebuild exactly what was drawn, merge neighbours of one colour, and never overlap', () => {
  const c = new PixelCanvas(6, 2);
  c.rect(0, 0, 3, 1, '#111111');
  c.rect(3, 0, 2, 1, '#222222');
  c.set(0, 1, '#111111');

  const sprite = c.toSprite();
  const painted = paint(sprite);

  assert.equal(sprite.runs.length, 3, 'three runs: two on the top row, one below');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 6; x++) assert.equal(painted.get(`${x},${y}`) ?? null, c.get(x, y));
  assert.deepEqual([sprite.width, sprite.height], [6, 2]);
});

test('Random - the same seed always gives the same numbers, and different seeds differ', () => {
  const a = createRandom(7);
  const b = createRandom(7);
  const first = [a(), a(), a()];

  assert.deepEqual([b(), b(), b()], first);
  assert.notDeepEqual([createRandom(8)(), createRandom(8)(), createRandom(8)()].slice(0, 1), first.slice(0, 1));
  assert.ok(first.every((n) => n >= 0 && n < 1));
});

// ---- the sprites --------------------------------------------------------------------------------------------------------

test('Pine - repeatable per seed, different between seeds, with a trunk, three greens and an outline', () => {
  const a = makePine({ seed: 3 });

  assert.ok(same(a, makePine({ seed: 3 })));
  assert.ok(!same(a, makePine({ seed: 4 })));
  const used = colours(a);
  for (const c of [SCENE.pineDark, SCENE.pineMid, SCENE.pineLight, SCENE.trunk, SCENE.outline]) assert.ok(used.has(c), `missing ${c}`);
});

test('Pine - stays inside its size, is narrower at the top than the bottom, and the trunk sits at the bottom centre', () => {
  const s = makePine({ seed: 1, width: 27, height: 44 });
  const painted = paint(s);

  assert.deepEqual([s.width, s.height], [27, 44]);
  for (const { x, y, w } of s.runs) assert.ok(x >= 0 && x + w <= 27 && y >= 0 && y < 44);
  const widthAt = (y) => [...painted.keys()].filter((k) => Number(k.split(',')[1]) === y).length;
  assert.ok(widthAt(6) < widthAt(30), 'the top is narrower than the lower tiers');
  assert.ok([SCENE.trunk, SCENE.trunkDark].includes(painted.get('13,42')), 'a trunk pixel at the bottom centre');
});

test('Cloud - repeatable, soft (no outline), light, with a shaded underside', () => {
  const a = makeCloud({ seed: 2 });

  assert.ok(same(a, makeCloud({ seed: 2 })));
  assert.ok(!same(a, makeCloud({ seed: 5 })));
  const used = colours(a);
  assert.ok(used.has(SCENE.cloud) && used.has(SCENE.cloudShade));
  assert.equal(used.has(SCENE.outline), false);
});

test('Ground - a grassy strip with soil under it, of the requested width', () => {
  const g = makeGround({ width: 60, seed: 1 });
  const used = colours(g);

  assert.equal(g.width, 60);
  for (const c of [SCENE.grass, SCENE.soil]) assert.ok(used.has(c));
  assert.ok(same(g, makeGround({ width: 60, seed: 1 })));
});

test('Small things - flower, grass tuft and leaf are small, drawn, and repeatable', () => {
  for (const make of [makeFlower, makeTuft, makeLeaf]) {
    const s = make({ seed: 1 });
    assert.ok(s.runs.length > 0);
    assert.ok(s.width <= 12 && s.height <= 12);
    assert.ok(same(s, make({ seed: 1 })));
  }
});

test('Icons - a lens, a book and a trail, each drawn and different', () => {
  const [lens, book, trail] = ['lens', 'book', 'trail'].map((n) => makeIcon(n));

  for (const s of [lens, book, trail]) assert.ok(s.runs.length > 0 && s.width <= 16 && s.height <= 16);
  assert.ok(!same(lens, book) && !same(book, trail) && !same(lens, trail));
  assert.throws(() => makeIcon('nope'), /icon/i);
});

test('Fishing rabbit - white fur, pink ears, a coral sweater, and an eye', () => {
  const r = makeFishingRabbit();
  const used = colours(r);

  for (const c of [SCENE.fur, SCENE.earInner, SCENE.sweater, SCENE.eye, SCENE.outline]) assert.ok(used.has(c), `missing ${c}`);
  assert.ok(same(r, makeFishingRabbit()));
});

// ---- the mascot, in pixels ------------------------------------------------------------------------------------------------

test('Mascot - every mood draws, all at the same size, so the rabbit never jumps around', () => {
  const sizes = new Set(MOODS.map((m) => { const s = makeRabbit(m); return `${s.width}x${s.height}`; }));

  assert.equal(sizes.size, 1);
  for (const m of MOODS) assert.ok(makeRabbit(m).runs.length > 20, m);
});

test('Mascot - each mood looks different from every other', () => {
  for (let i = 0; i < MOODS.length; i++) for (let j = i + 1; j < MOODS.length; j++) {
    assert.ok(!same(makeRabbit(MOODS[i]), makeRabbit(MOODS[j])), `${MOODS[i]} and ${MOODS[j]} look the same`);
  }
});

test('Mascot - it wears the coral sweater, and is repeatable', () => {
  assert.ok(colours(makeRabbit('happy')).has(SCENE.sweater));
  assert.ok(same(makeRabbit('sad'), makeRabbit('sad')));
});

test('Mascot - sad ears droop (a wider rabbit than the upright one), and the calm rabbit is not sad', () => {
  const extent = (s) => Math.max(...s.runs.map((r) => r.x + r.w)) - Math.min(...s.runs.map((r) => r.x));
  assert.ok(extent(makeRabbit('sad')) >= extent(makeRabbit('happy')));
  const sadTear = colours(makeRabbit('sad'));
  assert.ok(sadTear.size >= colours(makeRabbit('calm')).size - 1);
});

test('Mascot - the reading rabbit holds a phone and the detective a lens; neither appears on a plain happy rabbit', () => {
  const phone = SCENE.outline; // props use the scene outline colour for their frames
  assert.ok(makeRabbit('reading').runs.length > makeRabbit('happy').runs.length);
  assert.ok(makeRabbit('detective').runs.length > makeRabbit('happy').runs.length);
  assert.ok(colours(makeRabbit('reading')).has(phone));
});

test('Mascot - an unknown mood is a mistake, not a blank rabbit', () => {
  assert.throws(() => makeRabbit('furious'), /mood/i);
});

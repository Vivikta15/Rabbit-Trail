const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { pickDailyStory } = require('../dist/lib/stories/daily-pick.js');
const { loadCatalog, loadGeneratedStories, toIndexEntry, isStory } = require('../dist/lib/stories/catalog.js');
const { VERIFIED_STORIES } = require('../dist/data/stories.js');
const {
  PROFILE_STORAGE_KEY,
  loadProfileArchetype,
  saveProfileArchetype,
} = require('../dist/lib/profile/profile-store.js');

const entry = (id, date, sourceTitle, relatedTopics = []) => ({
  id,
  date,
  title: `Story ${id}`,
  topic: sourceTitle,
  era: 'test era',
  sourceTitle,
  relatedTopics,
});

const read = (storyId, date) => ({ storyId, date });

// A small rabbit-hole: Arsenal links to Lepanto, Galileo and the history of Venice; Lepanto links to
// Cervantes and also to the history of Venice, so Venice is connected to two things a reader can have read.
const INDEX = [
  entry('arsenal', '2026-10-01', 'Venetian Arsenal', ['Battle of Lepanto', 'Galileo Galilei', 'History of Venice']),
  entry('galileo', '2026-10-02', 'Galileo Galilei', ['Telescope']),
  entry('lepanto', '2026-10-03', 'Battle of Lepanto', ['Miguel de Cervantes', 'History of Venice']),
  entry('cervantes', '2026-10-04', 'Miguel de Cervantes', []),
  entry('unrelated', '2026-10-05', 'Silk Road', []),
  entry('venice', '2026-10-06', 'History of Venice', []),
];

test('Daily pick - a new reader starts with the oldest story', () => {
  const pick = pickDailyStory(INDEX, [], '2026-10-10');

  assert.deepEqual(pick, { kind: 'story', storyId: 'arsenal', reason: 'next-unread' });
});

test('Daily pick - follows the trail to a story the last read story links to', () => {
  // Read the Arsenal; Galileo, Lepanto and Venice are each linked from it (1 connection each).
  // The tie goes to the oldest, Galileo; the unrelated story is never chosen over a connected one.
  const pick = pickDailyStory(INDEX, [read('arsenal', '2026-10-09')], '2026-10-10');

  assert.equal(pick.kind, 'story');
  assert.equal(pick.reason, 'follows-trail');
  assert.equal(pick.storyId, 'galileo');
});

test('Daily pick - prefers the story connected to more of what was read, even if newer', () => {
  // After the Arsenal and Lepanto: Venice is linked from both (2), Galileo and Cervantes from one (1 each).
  // Venice is the newest story but has the strongest connection.
  const pick = pickDailyStory(
    INDEX,
    [read('arsenal', '2026-10-08'), read('lepanto', '2026-10-09')],
    '2026-10-10',
  );

  assert.deepEqual(pick, { kind: 'story', storyId: 'venice', reason: 'follows-trail' });
});

test('Daily pick - a link in either direction counts as a connection', () => {
  // Cervantes links to nothing, but Lepanto (unread) links to Cervantes: reading Cervantes should pull Lepanto.
  const pick = pickDailyStory(INDEX, [read('cervantes', '2026-10-09')], '2026-10-10');

  assert.equal(pick.storyId, 'lepanto');
  assert.equal(pick.reason, 'follows-trail');
});

test('Daily pick - with no connection left it falls back to the oldest unread', () => {
  const index = [entry('a', '2026-10-01', 'A', []), entry('b', '2026-10-02', 'B', []), entry('c', '2026-10-03', 'C', [])];
  const pick = pickDailyStory(index, [read('a', '2026-10-09')], '2026-10-10');

  assert.deepEqual(pick, { kind: 'story', storyId: 'b', reason: 'next-unread' });
});

test('Daily pick - after finishing a story today, today stays that story', () => {
  const pick = pickDailyStory(INDEX, [read('galileo', '2026-10-10')], '2026-10-10');

  assert.deepEqual(pick, { kind: 'story', storyId: 'galileo', reason: 'finished-today' });
});

test('Daily pick - is stable when asked again with the same history', () => {
  const history = [read('arsenal', '2026-10-09')];

  assert.deepEqual(pickDailyStory(INDEX, history, '2026-10-10'), pickDailyStory(INDEX, history, '2026-10-10'));
});

test('Daily pick - never repeats a story and reports when the reader is caught up', () => {
  const all = INDEX.map((e) => read(e.id, '2026-10-01'));

  assert.deepEqual(pickDailyStory(INDEX, all, '2026-10-10'), { kind: 'caught-up' });
  assert.deepEqual(pickDailyStory([], [], '2026-10-10'), { kind: 'caught-up' });

  const pick = pickDailyStory(INDEX, [read('arsenal', '2026-10-09')], '2026-10-10');
  assert.notEqual(pick.storyId, 'arsenal');
});

test('Daily pick - ignores reads of stories no longer in the catalog', () => {
  const pick = pickDailyStory(INDEX, [read('deleted-story', '2026-10-09')], '2026-10-10');

  assert.equal(pick.storyId, 'arsenal');
});

function makeGenerated(id, extra = {}) {
  const base = VERIFIED_STORIES[0];
  return { ...structuredClone(base), id, date: '2026-10-20', title: `Generated ${id}`, ...extra };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-trail-stories-'));
}

test('Catalog - the built-in seed story has the fields the feed needs', () => {
  const seed = VERIFIED_STORIES[0];

  assert.equal(isStory(seed), true);
  assert.ok(seed.source.url.startsWith('https://en.wikipedia.org/'));
  assert.ok(seed.relatedTopics.length >= 5, 'the seed needs onward links so the trail can continue from it');

  const indexEntry = toIndexEntry(seed);
  assert.equal(indexEntry.id, seed.id);
  assert.equal(indexEntry.sourceTitle, seed.source.title);
  assert.deepEqual(indexEntry.relatedTopics, seed.relatedTopics);
  assert.equal('facts' in indexEntry, false, 'the index must not carry the full story to the client');
});

test('Catalog - loads generated stories from a directory, seed first, oldest first', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(makeGenerated('gen-b', { date: '2026-10-22' })));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(makeGenerated('gen-a', { date: '2026-10-21' })));

  const catalog = loadCatalog(dir);

  // The seed story is dated 2026-10-16, so oldest-first puts it ahead of both generated stories.
  assert.deepEqual(catalog.map((s) => s.id), [VERIFIED_STORIES[0].id, 'gen-a', 'gen-b']);
});

test('Catalog - a missing directory yields just the seed story', () => {
  const catalog = loadCatalog(path.join(os.tmpdir(), 'rabbit-trail-does-not-exist'));

  assert.deepEqual(catalog.map((s) => s.id), [VERIFIED_STORIES[0].id]);
});

test('Catalog - skips malformed or incomplete files instead of failing the feed', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify(makeGenerated('gen-good')));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
  fs.writeFileSync(path.join(dir, 'partial.json'), JSON.stringify({ id: 'partial', title: 'no facts' }));
  const noVariants = makeGenerated('no-variants');
  delete noVariants.presentationVariants.magpie;
  fs.writeFileSync(path.join(dir, 'no-variants.json'), JSON.stringify(noVariants));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

  assert.deepEqual(loadGeneratedStories(dir).map((s) => s.id), ['gen-good']);
});

test('Catalog - a generated story cannot replace the seed story or another with the same id', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'clash.json'), JSON.stringify(makeGenerated(VERIFIED_STORIES[0].id, { title: 'Impostor' })));

  const catalog = loadCatalog(dir);

  assert.equal(catalog.length, 1);
  assert.notEqual(catalog[0].title, 'Impostor');
});

test('Profile - the saved archetype round-trips and rejects unknown values', () => {
  const data = {};
  const storage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };

  assert.equal(loadProfileArchetype(storage), null);
  saveProfileArchetype(storage, 'detective');
  assert.equal(loadProfileArchetype(storage), 'detective');

  data[PROFILE_STORAGE_KEY] = JSON.stringify({ archetypeId: 'wizard' });
  assert.equal(loadProfileArchetype(storage), null);
  data[PROFILE_STORAGE_KEY] = '{oops';
  assert.equal(loadProfileArchetype(storage), null);
  assert.equal(loadProfileArchetype(null), null);
});

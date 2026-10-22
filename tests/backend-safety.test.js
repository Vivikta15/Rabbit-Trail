const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { acquireLock } = require('../dist/lib/pipeline/lock.js');
const { PipelineAbort } = require('../dist/lib/pipeline/http.js');
const { publishStory, cleanStaleTemps } = require('../dist/lib/pipeline/publish.js');
const { createFileRepository } = require('../dist/lib/stories/file-repository.js');
const { generateNextStory } = require('../dist/lib/pipeline/run.js');
const { explainStoryProblem, isStory, inspectStoriesDir, loadCatalog } = require('../dist/lib/stories/catalog.js');
const { cleanParam } = require('../dist/lib/api/validate.js');
const { VERIFIED_STORIES } = require('../dist/data/stories.js');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-trail-safety-'));
const lockFile = (dir) => path.join(dir, '.generate.lock');
const gen = (over = {}) => ({ ...structuredClone(VERIFIED_STORIES[0]), id: 'gen-one', date: '2026-10-20', ...over });

// ---- run lock ----------------------------------------------------------------------------------

test('Lock - one run at a time: a second run is refused while the first holds the lock', () => {
  const dir = tempDir();
  const first = acquireLock(dir);

  assert.throws(() => acquireLock(dir), (err) => err instanceof PipelineAbort && /already in progress/i.test(err.message));
  first.release();
  assert.doesNotThrow(() => acquireLock(dir).release());
});

test('Lock - release removes the lock file', () => {
  const dir = tempDir();
  acquireLock(dir).release();

  assert.equal(fs.existsSync(lockFile(dir)), false);
});

test('Lock - a lock left by a crashed run (dead process) is taken over', () => {
  const dir = tempDir();
  fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: 999999, startedAt: Date.now() }));

  const handle = acquireLock(dir, { isProcessAlive: () => false });

  assert.ok(handle);
  handle.release();
});

test('Lock - a lock held by a live process is respected', () => {
  const dir = tempDir();
  fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: 4242, startedAt: Date.now() }));

  assert.throws(() => acquireLock(dir, { isProcessAlive: () => true }), /already in progress/i);
});

test('Lock - a lock older than the stale limit is taken over even if its pid looks alive', () => {
  const dir = tempDir();
  const now = 10_000_000;
  fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: 4242, startedAt: now - 3 * 60 * 60 * 1000 }));

  const handle = acquireLock(dir, { now: () => now, isProcessAlive: () => true, staleMs: 30 * 60 * 1000 });

  assert.ok(handle);
  handle.release();
});

test('Lock - an unreadable lock file is held while fresh and taken over once old', () => {
  const dir = tempDir();
  fs.writeFileSync(lockFile(dir), '{garbage');

  assert.throws(() => acquireLock(dir), /already in progress/i);

  const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
  fs.utimesSync(lockFile(dir), old, old);
  const handle = acquireLock(dir);
  assert.ok(handle);
  handle.release();
});

test('Lock - release never deletes a lock that now belongs to someone else', () => {
  const dir = tempDir();
  const mine = acquireLock(dir);
  fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: 1, startedAt: Date.now(), owner: 'someone-else' }));

  mine.release();

  assert.equal(fs.existsSync(lockFile(dir)), true);
});

test('Lock state - reports none, held and stale without touching the file', () => {
  const { lockState } = require('../dist/lib/pipeline/lock.js');
  const dir = tempDir();
  assert.equal(lockState(dir), 'none');

  fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: 4242, startedAt: Date.now() }));
  assert.equal(lockState(dir, { isProcessAlive: () => true }), 'held');
  assert.equal(lockState(dir, { isProcessAlive: () => false }), 'stale');
  assert.equal(fs.existsSync(lockFile(dir)), true, 'inspecting must not remove the lock');
});

test('Temp files - finding stale ones does not delete them', () => {
  const { findStaleTemps } = require('../dist/lib/pipeline/publish.js');
  const dir = tempDir();
  const old = path.join(dir, 'old.json.tmp');
  fs.writeFileSync(old, 'x');
  const longAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
  fs.utimesSync(old, longAgo, longAgo);

  assert.deepEqual(findStaleTemps(dir), ['old.json.tmp']);
  assert.equal(fs.existsSync(old), true);
});

test('Run - refuses to start while another run holds the lock, and releases the lock when done', async () => {
  const dir = tempDir();
  const held = acquireLock(dir);
  const wiki = { fetchPage: async () => null };
  const llm = { complete: async () => '{}' };

  const blocked = await generateNextStory({ repo: createFileRepository(dir), today: '2026-10-22', wiki, llm, maxAttempts: 1 });
  assert.equal(blocked.status, 'aborted');
  assert.match(blocked.reason, /already in progress/i);

  held.release();
  const ran = await generateNextStory({ repo: createFileRepository(dir), today: '2026-10-22', wiki, llm, maxAttempts: 1 });
  assert.notEqual(ran.status, 'aborted');
  assert.equal(fs.existsSync(lockFile(dir)), false, 'the lock must be released after a normal run');
});

test('Run - releases the lock even when the run blows up unexpectedly', async () => {
  const dir = tempDir();
  const wiki = { fetchPage: async () => { throw new PipelineAbort('boom'); } };

  await generateNextStory({ repo: createFileRepository(dir), today: '2026-10-22', wiki, llm: { complete: async () => '{}' }, maxAttempts: 1 });

  assert.equal(fs.existsSync(lockFile(dir)), false);
});

// ---- publish safety ----------------------------------------------------------------------------

test('Publish - a story id that could escape the folder is refused and nothing is written', () => {
  const dir = tempDir();
  const outside = path.join(dir, '..', 'evil.json');

  for (const id of ['../evil', 'a/b', 'a\\b', '', 'UPPER', '.hidden', 'x'.repeat(200)]) {
    assert.throws(() => publishStory(gen({ id }), dir), /unsafe story id/i, id);
  }
  assert.equal(fs.existsSync(outside), false);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('Publish - old temp files from a crashed write are cleaned up, recent ones are left alone', () => {
  const dir = tempDir();
  const old = path.join(dir, 'old.json.tmp');
  const fresh = path.join(dir, 'fresh.json.tmp');
  const keep = path.join(dir, 'real.json');
  for (const f of [old, fresh, keep]) fs.writeFileSync(f, 'x');
  const longAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
  fs.utimesSync(old, longAgo, longAgo);

  const removed = cleanStaleTemps(dir);

  assert.deepEqual(removed, ['old.json.tmp']);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(keep), true);
  assert.deepEqual(cleanStaleTemps(path.join(dir, 'missing')), []);
});

// ---- story validation --------------------------------------------------------------------------

test('Story check - the seed story and a clean copy are valid', () => {
  assert.equal(explainStoryProblem(VERIFIED_STORIES[0]), null);
  assert.equal(isStory(gen()), true);
});

test('Story check - names the first thing wrong, so a bad file can be fixed', () => {
  const noFacts = gen({ facts: [] });
  const noQuote = gen();
  delete noQuote.counterArgument.thesis;
  const noVariant = gen();
  delete noVariant.presentationVariants.magpie;

  assert.match(explainStoryProblem(noFacts), /facts/);
  assert.match(explainStoryProblem(noQuote), /counterArgument/);
  assert.match(explainStoryProblem(noVariant), /magpie/);
  assert.match(explainStoryProblem(null), /object/i);
  assert.match(explainStoryProblem(gen({ id: '../x' })), /id/);
  assert.match(explainStoryProblem(gen({ date: 'yesterday' })), /date/);
});

test('Story check - links must be web links, so a bad file can never inject a javascript: URL', () => {
  const badSource = gen({ source: { title: 'T', url: 'javascript:alert(1)' } });
  const badFact = gen();
  badFact.facts[0].sourceUrl = 'data:text/html,<script>alert(1)</script>';
  const okHttp = gen();
  okHttp.facts[0].sourceUrl = 'http://example.com/page';

  assert.match(explainStoryProblem(badSource), /url/i);
  assert.match(explainStoryProblem(badFact), /sourceUrl/);
  assert.equal(explainStoryProblem(okHttp), null);
});

test('Story check - inspecting a folder reports every unusable file with its reason', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify(gen({ id: 'good' })));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{nope');
  fs.writeFileSync(path.join(dir, 'partial.json'), JSON.stringify({ id: 'partial' }));
  fs.writeFileSync(path.join(dir, 'rejected-topics.jsonl'), '{}\n');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

  const report = inspectStoriesDir(dir);

  assert.deepEqual(report.valid.map((s) => s.id), ['good']);
  assert.deepEqual(report.problems.map((p) => p.file).sort(), ['broken.json', 'partial.json']);
  assert.match(report.problems.find((p) => p.file === 'broken.json').reason, /json/i);
  assert.equal(inspectStoriesDir(path.join(dir, 'missing')).valid.length, 0);
});

test('Story check - two files claiming the same story id: the first wins and the clash is reported', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(gen({ id: 'same', title: 'First' })));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(gen({ id: 'same', title: 'Second' })));

  const report = inspectStoriesDir(dir);

  assert.deepEqual(report.valid.map((s) => s.title), ['First']);
  assert.match(report.problems[0].reason, /duplicate/i);
  assert.equal(loadCatalog(dir).filter((s) => s.id === 'same').length, 1);
});

// ---- api input ---------------------------------------------------------------------------------

test('API input - accepts normal text and trims it', () => {
  assert.equal(cleanParam('  cheese ', 80), 'cheese');
  assert.equal(cleanParam('The Moon', 80), 'The Moon');
});

test('API input - rejects missing, blank, oversized and control-character input', () => {
  assert.equal(cleanParam(null, 80), null);
  assert.equal(cleanParam('   ', 80), null);
  assert.equal(cleanParam('x'.repeat(81), 80), null);
  assert.equal(cleanParam('bad\u0000input', 80), null);
  assert.equal(cleanParam('line\nbreak', 80), null);
  assert.equal(cleanParam('x'.repeat(80), 80), 'x'.repeat(80));
});

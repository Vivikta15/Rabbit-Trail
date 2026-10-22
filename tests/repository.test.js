const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { StoryExistsError } = require('../dist/lib/stories/repository.js');
const { createFileRepository } = require('../dist/lib/stories/file-repository.js');
const { getCatalog, loadCatalog } = require('../dist/lib/stories/catalog.js');
const { PipelineAbort } = require('../dist/lib/pipeline/http.js');
const { VERIFIED_STORIES } = require('../dist/data/stories.js');

const gen = (over = {}) => ({ ...structuredClone(VERIFIED_STORIES[0]), id: 'gen-one', date: '2026-10-20', ...over });

// The behaviour every storage backend must have. The file backend runs it here; the Supabase backend runs the
// same suite against a fake server in supabase-repository.test.js, so the two cannot drift apart.
function repositoryContract(name, makeRepo, plantBadRecord) {
  test(`${name}: starts empty`, async () => {
    const { valid, problems } = await (await makeRepo()).list();

    assert.deepEqual(valid, []);
    assert.deepEqual(problems, []);
  });

  test(`${name}: a saved story is listed back unchanged`, async () => {
    const repo = await makeRepo();
    await repo.save(gen());

    const { valid } = await repo.list();
    assert.equal(valid.length, 1);
    assert.deepEqual(valid[0], gen());
  });

  test(`${name}: saving an id that already exists fails and keeps the original`, async () => {
    const repo = await makeRepo();
    await repo.save(gen({ title: 'Original' }));

    await assert.rejects(() => repo.save(gen({ title: 'Impostor' })), (err) => err instanceof StoryExistsError && /already exists/i.test(err.message));
    assert.deepEqual((await repo.list()).valid.map((s) => s.title), ['Original']);
  });

  test(`${name}: an unsafe id is refused and nothing is stored`, async () => {
    const repo = await makeRepo();

    for (const id of ['../evil', 'a/b', '', 'UPPER']) {
      await assert.rejects(() => repo.save(gen({ id })), /unsafe story id/i, id);
    }
    assert.deepEqual((await repo.list()).valid, []);
  });

  test(`${name}: rejected topics are remembered, lower-cased, and repeats are harmless`, async () => {
    const repo = await makeRepo();
    assert.equal((await repo.loadRejected()).size, 0);

    await repo.recordRejection('Boring Page', 'no decision', '2026-10-22');
    await repo.recordRejection('Boring Page', 'again', '2026-10-23');
    await repo.recordRejection('Other', 'gone', '2026-10-22');

    assert.deepEqual([...(await repo.loadRejected())].sort(), ['boring page', 'other']);
  });

  test(`${name}: only one holder of the run lock at a time, and it can be taken again after release`, async () => {
    const repo = await makeRepo();
    const first = await repo.acquireLock();

    await assert.rejects(() => repo.acquireLock(), (err) => err instanceof PipelineAbort && /already in progress/i.test(err.message));
    await first.release();
    await first.release(); // releasing twice must be harmless
    const second = await repo.acquireLock();
    await second.release();
  });

  test(`${name}: recording a run and housekeeping never fail and never show up as stories`, async () => {
    const repo = await makeRepo();

    await repo.recordRun({ startedAt: '2026-10-22T10:00:00Z', finishedAt: '2026-10-22T10:01:00Z', status: 'published', publishedId: 'x', details: { calls: 2 } });
    assert.ok(Array.isArray(await repo.housekeeping()));
    assert.deepEqual((await repo.list()).valid, []);
  });

  test(`${name}: a damaged record is reported, and does not hide the good ones`, async () => {
    const repo = await makeRepo();
    await repo.save(gen({ id: 'good' }));
    await plantBadRecord(repo);

    const { valid, problems } = await repo.list();
    assert.deepEqual(valid.map((s) => s.id), ['good']);
    assert.equal(problems.length, 1);
    assert.ok(problems[0].reason.length > 0);
  });

  test(`${name}: describes itself for messages`, async () => {
    assert.ok((await makeRepo()).describe().length > 0);
  });

  test(`${name}: get returns one story, or null when it is missing or the id is unusable`, async () => {
    const repo = await makeRepo();
    await repo.save(gen({ id: 'one' }));
    await repo.save(gen({ id: 'two', title: 'Second' }));

    assert.deepEqual(await repo.get('two'), gen({ id: 'two', title: 'Second' }));
    assert.equal(await repo.get('missing'), null);
    for (const id of ['../x', 'a/b', '', 'UPPER', "x' or '1'='1"]) assert.equal(await repo.get(id), null, id);
  });

  test(`${name}: listIndex gives a light entry per story, oldest first, without the story body`, async () => {
    const repo = await makeRepo();
    await repo.save(gen({ id: 'later', date: '2026-10-22', title: 'Later' }));
    await repo.save(gen({ id: 'earlier', date: '2026-10-17', title: 'Earlier' }));

    const index = await repo.listIndex();

    assert.deepEqual(index.map((e) => e.id), ['earlier', 'later']);
    assert.deepEqual(Object.keys(index[0]).sort(), ['date', 'era', 'id', 'relatedTopics', 'sourceTitle', 'title', 'topic']);
    assert.equal(index[0].sourceTitle, VERIFIED_STORIES[0].source.title);
    assert.deepEqual(index[0].relatedTopics, VERIFIED_STORIES[0].relatedTopics);
  });

  test(`${name}: verify says what it checked`, async () => {
    const message = await (await makeRepo()).verify();

    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  });

  test(`${name}: a story that is not valid is refused on save and never stored`, async () => {
    const repo = await makeRepo();
    const bad = gen({ id: 'bad' });
    bad.facts = [];

    await assert.rejects(() => repo.save(bad), /invalid story/i);
    assert.deepEqual((await repo.list()).valid, []);
  });
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-trail-repo-'));

repositoryContract(
  'File repository',
  async () => createFileRepository(tempDir()),
  async (repo) => fs.writeFileSync(path.join(repo.dir, 'broken.json'), '{nope'),
);

test('File repository: reports its kind and folder', () => {
  const dir = tempDir();
  const repo = createFileRepository(dir);

  assert.equal(repo.kind, 'file');
  assert.equal(repo.dir, dir);
  assert.match(repo.describe(), /files/i);
});

test('Catalog: getCatalog merges the built-in story with the repository, oldest first, built-in winning clashes', async () => {
  const repo = createFileRepository(tempDir());
  await repo.save(gen({ id: 'later', date: '2026-10-22' }));
  await repo.save(gen({ id: 'earlier', date: '2026-10-17' }));
  // A stored story that reuses the built-in story's id must never replace it.
  await repo.save(gen({ id: VERIFIED_STORIES[0].id, date: '2026-10-30', title: 'Impostor' }));

  const catalog = await getCatalog(repo);
  const ids = catalog.map((s) => s.id);

  assert.equal(ids[0], VERIFIED_STORIES[0].id);
  assert.ok(ids.indexOf('earlier') < ids.indexOf('later'));
  assert.equal(catalog.filter((s) => s.id === VERIFIED_STORIES[0].id).length, 1);
  assert.notEqual(catalog.find((s) => s.id === VERIFIED_STORIES[0].id).title, 'Impostor');
});

test('Catalog: getStoryById finds the built-in story first, then stored ones, else null', async () => {
  const { getStoryById } = require('../dist/lib/stories/catalog.js');
  const repo = createFileRepository(tempDir());
  await repo.save(gen({ id: 'stored-one', title: 'Stored' }));
  await repo.save(gen({ id: VERIFIED_STORIES[0].id, title: 'Impostor', date: '2026-10-30' }));

  assert.equal((await getStoryById(repo, 'stored-one')).title, 'Stored');
  assert.equal((await getStoryById(repo, VERIFIED_STORIES[0].id)).title, VERIFIED_STORIES[0].title, 'built-in wins a clash');
  assert.equal(await getStoryById(repo, 'nope'), null);
  assert.equal(await getStoryById(repo, '../etc/passwd'), null);
});

test('Catalog: getIndex lists the built-in story and stored ones once each, oldest first', async () => {
  const { getIndex } = require('../dist/lib/stories/catalog.js');
  const repo = createFileRepository(tempDir());
  await repo.save(gen({ id: 'later', date: '2026-10-22' }));
  await repo.save(gen({ id: 'earlier', date: '2026-10-17' }));
  await repo.save(gen({ id: VERIFIED_STORIES[0].id, title: 'Impostor', date: '2026-10-01' }));

  const index = await getIndex(repo);

  assert.deepEqual(index.map((e) => e.id), [VERIFIED_STORIES[0].id, 'earlier', 'later']);
  assert.notEqual(index[0].title, 'Impostor');
  assert.equal('facts' in index[0], false);
});

test('Catalog: getIndex agrees with getCatalog', async () => {
  const { getIndex, toIndexEntry } = require('../dist/lib/stories/catalog.js');
  const repo = createFileRepository(tempDir());
  await repo.save(gen({ id: 'one', date: '2026-10-21' }));

  assert.deepEqual(await getIndex(repo), (await getCatalog(repo)).map(toIndexEntry));
});

test('Repository factory: builds the backend chosen from the environment', () => {
  const { createRepository } = require('../dist/lib/stories/get-repository.js');

  assert.equal(createRepository({ kind: 'file', dir: tempDir() }).kind, 'file');
  assert.equal(createRepository({ kind: 'supabase', url: 'https://abcdefghij.supabase.co', serviceKey: 'sb_secret_' + 'x'.repeat(30) }).kind, 'supabase');
  assert.throws(() => createRepository({ kind: 'error', problems: ['SUPABASE_URL is missing.', 'second problem'] }), /SUPABASE_URL is missing.*second problem/s);
});

test('Repository factory: tuning is passed through to the Supabase repository', async () => {
  const { createRepository } = require('../dist/lib/stories/get-repository.js');
  let calls = 0;
  const repo = createRepository(
    { kind: 'supabase', url: 'https://abcdefghij.supabase.co', serviceKey: 'sb_secret_' + 'x'.repeat(30) },
    { fetchImpl: async () => { calls += 1; return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({}), text: async () => '{}' }; }, retry: { retries: 0 } },
  );

  await assert.rejects(() => repo.list(), /try again later/i);
  assert.equal(calls, 1);
});

test('Repository factory: web requests fail fast so a reader never waits long on a dead database', () => {
  const { WEB_TUNING } = require('../dist/lib/stories/get-repository.js');

  assert.ok(WEB_TUNING.retry.retries <= 1, 'at most one retry on the web');
  assert.ok(WEB_TUNING.timeoutMs <= 10000, 'a hung request is cut off within ten seconds');
  const worstCaseMs = WEB_TUNING.timeoutMs * (WEB_TUNING.retry.retries + 1) + WEB_TUNING.retry.maxDelayMs * WEB_TUNING.retry.retries * 1.25;
  assert.ok(worstCaseMs <= 25000, `worst case ${worstCaseMs} ms is too long to leave a reader waiting`);
});

test('Repository factory: getRepository follows the environment, and refuses a half-configured one', () => {
  const { getRepository } = require('../dist/lib/stories/get-repository.js');

  assert.equal(getRepository({}, '/work').kind, 'file');
  assert.throws(() => getRepository({ SUPABASE_URL: 'https://abcdefghij.supabase.co' }, '/work'), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.throws(() => getRepository({ VERCEL: '1' }, '/work'), /Vercel/);
});

test('Catalog: getCatalog gives the same result as the synchronous file loader', async () => {
  const dir = tempDir();
  const repo = createFileRepository(dir);
  await repo.save(gen({ id: 'one', date: '2026-10-21' }));
  await repo.save(gen({ id: 'two', date: '2026-10-22' }));

  assert.deepEqual((await getCatalog(repo)).map((s) => s.id), loadCatalog(dir).map((s) => s.id));
});

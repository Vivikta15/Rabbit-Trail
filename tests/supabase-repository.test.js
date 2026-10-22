const test = require('node:test');
const assert = require('node:assert/strict');

const { createFakePostgrest, MAX_ROWS } = require('./helpers/fake-postgrest.js');
const { createSupabaseRepository } = require('../dist/lib/stories/supabase-repository.js');
const { DatabaseSchemaError } = require('../dist/lib/db/supabase-rest.js');
const { AuthError, PipelineAbort } = require('../dist/lib/pipeline/http.js');
const { StoryExistsError } = require('../dist/lib/stories/repository.js');
const { VERIFIED_STORIES } = require('../dist/data/stories.js');

const URL_ = 'https://abcdefghij.supabase.co';
const KEY = 'sb_secret_' + 'S'.repeat(32); // built by concatenation so no key-looking literal sits in the repo
const gen = (over = {}) => ({ ...structuredClone(VERIFIED_STORIES[0]), id: 'gen-one', date: '2026-10-20', ...over });
const fastRetry = { retries: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {}, random: () => 0 };

function make(fakeOptions = {}, repoOptions = {}) {
  const fake = createFakePostgrest({ serviceKey: KEY, ...fakeOptions });
  const repo = createSupabaseRepository({ url: URL_, serviceKey: KEY, fetchImpl: fake.fetchImpl, retry: fastRetry, ...repoOptions });
  return { fake, repo };
}

// ---- the shared contract, run against the fake Supabase ----------------------------------------

// (Imported lazily so the contract lives in one place: repository.test.js defines the same behaviours for files.)
function contract(name, makeRepo, plantBadRecord) {
  const run = (title, fn) => test(`${name}: ${title}`, fn);

  run('starts empty', async () => {
    const { valid, problems } = await (await makeRepo()).list();
    assert.deepEqual([valid, problems], [[], []]);
  });
  run('a saved story is listed back unchanged', async () => {
    const repo = await makeRepo();
    await repo.save(gen());
    assert.deepEqual((await repo.list()).valid, [gen()]);
  });
  run('saving an id that already exists fails and keeps the original', async () => {
    const repo = await makeRepo();
    await repo.save(gen({ title: 'Original' }));
    await assert.rejects(() => repo.save(gen({ title: 'Impostor' })), (e) => e instanceof StoryExistsError && /already exists/i.test(e.message));
    assert.deepEqual((await repo.list()).valid.map((s) => s.title), ['Original']);
  });
  run('an unsafe id is refused and nothing is stored', async () => {
    const repo = await makeRepo();
    for (const id of ['../evil', 'a/b', '', 'UPPER']) await assert.rejects(() => repo.save(gen({ id })), /unsafe story id/i, id);
    assert.deepEqual((await repo.list()).valid, []);
  });
  run('rejected topics are remembered, lower-cased, and repeats are harmless', async () => {
    const repo = await makeRepo();
    await repo.recordRejection('Boring Page', 'no decision', '2026-10-22');
    await repo.recordRejection('Boring Page', 'again', '2026-10-23');
    await repo.recordRejection('Other', 'gone', '2026-10-22');
    assert.deepEqual([...(await repo.loadRejected())].sort(), ['boring page', 'other']);
  });
  run('only one holder of the run lock at a time, and it can be taken again after release', async () => {
    const repo = await makeRepo();
    const first = await repo.acquireLock();
    await assert.rejects(() => repo.acquireLock(), (e) => e instanceof PipelineAbort && /already in progress/i.test(e.message));
    await first.release();
    await first.release();
    await (await repo.acquireLock()).release();
  });
  run('recording a run and housekeeping never fail and never show up as stories', async () => {
    const repo = await makeRepo();
    await repo.recordRun({ startedAt: '2026-10-22T10:00:00Z', finishedAt: '2026-10-22T10:01:00Z', status: 'published', publishedId: 'x', details: { calls: 2 } });
    assert.ok(Array.isArray(await repo.housekeeping()));
    assert.deepEqual((await repo.list()).valid, []);
  });
  run('a damaged record is reported, and does not hide the good ones', async () => {
    const repo = await makeRepo();
    await repo.save(gen({ id: 'good' }));
    await plantBadRecord(repo);
    const { valid, problems } = await repo.list();
    assert.deepEqual(valid.map((s) => s.id), ['good']);
    assert.equal(problems.length, 1);
  });
  run('describes itself for messages', async () => assert.ok((await makeRepo()).describe().length > 0));
  run('get returns one story, or null when it is missing or the id is unusable', async () => {
    const repo = await makeRepo();
    await repo.save(gen({ id: 'one' }));
    await repo.save(gen({ id: 'two', title: 'Second' }));
    assert.deepEqual(await repo.get('two'), gen({ id: 'two', title: 'Second' }));
    assert.equal(await repo.get('missing'), null);
    for (const id of ['../x', 'a/b', '', 'UPPER', "x' or '1'='1"]) assert.equal(await repo.get(id), null, id);
  });
  run('listIndex gives a light entry per story, oldest first, without the story body', async () => {
    const repo = await makeRepo();
    await repo.save(gen({ id: 'later', date: '2026-10-22', title: 'Later' }));
    await repo.save(gen({ id: 'earlier', date: '2026-10-17', title: 'Earlier' }));
    const index = await repo.listIndex();
    assert.deepEqual(index.map((e) => e.id), ['earlier', 'later']);
    assert.deepEqual(Object.keys(index[0]).sort(), ['date', 'era', 'id', 'relatedTopics', 'sourceTitle', 'title', 'topic']);
  });
  run('verify says what it checked', async () => {
    const message = await (await makeRepo()).verify();
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  });
  run('a story that is not valid is refused on save and never stored', async () => {
    const repo = await makeRepo();
    const bad = gen({ id: 'bad' });
    bad.facts = [];
    await assert.rejects(() => repo.save(bad), /invalid story/i);
    assert.deepEqual((await repo.list()).valid, []);
  });
}

let planted;
contract(
  'Supabase repository',
  async () => {
    const { fake, repo } = make();
    planted = fake;
    return repo;
  },
  async () => planted.tables.stories.push({ id: 'damaged', date: '2026-10-21', title: 't', topic: 't', era: 'e', source_title: 's', related_topics: [], data: { id: 'damaged' } }),
);

// ---- what only the real backend has to get right -----------------------------------------------

test('Supabase: every request carries the service key in headers, never in the URL', async () => {
  const { fake, repo } = make();
  await repo.save(gen());
  await repo.list();

  assert.ok(fake.requests.length >= 2);
  for (const r of fake.requests) {
    assert.equal(r.headers.apikey, KEY);
    assert.equal(r.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(r.url.includes(KEY), false, 'the key must not be placed in a URL');
    assert.ok(r.url.startsWith(`${URL_}/rest/v1/`));
  }
});

test('Supabase: no response is ever cached, so a new story shows up the moment it is saved', async () => {
  // Next.js caches server-side fetch() results unless told not to. A cached story index would hide each new
  // daily story from readers until the cache happened to expire.
  const { fake, repo } = make();
  await repo.save(gen());
  await repo.list();
  await repo.listIndex();
  await repo.get('gen-one');
  await repo.loadRejected();

  assert.ok(fake.requests.length >= 5);
  for (const r of fake.requests) assert.equal(r.cache, 'no-store', `${r.method} ${new URL(r.url).pathname} must not be cached`);
});

test('Supabase: more stories than one request can return are all listed', async () => {
  const { fake, repo } = make();
  const total = MAX_ROWS + 250;
  for (let i = 0; i < total; i++) {
    const id = `story-${String(i).padStart(5, '0')}`;
    fake.tables.stories.push({ id, date: '2026-10-01', title: id, topic: 't', era: 'e', source_title: id, related_topics: [], data: gen({ id, title: id }) });
  }

  assert.equal((await repo.list()).valid.length, total);
  assert.equal((await repo.listIndex()).length, total);
});

test('Supabase: ids are never put into a query without being checked first', async () => {
  const { fake, repo } = make();
  assert.equal(await repo.get("x' or '1'='1"), null);

  assert.equal(fake.requests.length, 0, 'an unusable id must not reach the database at all');
});

test('Supabase: a wrong service key is reported as a rejected key, without repeating it', async () => {
  const fake = createFakePostgrest({ serviceKey: KEY });
  const repo = createSupabaseRepository({ url: URL_, serviceKey: 'sb_secret_' + 'W'.repeat(32), fetchImpl: fake.fetchImpl, retry: fastRetry });

  await assert.rejects(() => repo.list(), (e) => e instanceof AuthError && /SUPABASE_SERVICE_ROLE_KEY/.test(e.message) && !e.message.includes('WWWW'));
  assert.equal(fake.requests.length, 1, 'a rejected key must not be retried');
});

test('Supabase: a missing table says to run the migration', async () => {
  const { repo } = make({ missingTables: ['stories'] });

  await assert.rejects(() => repo.list(), (e) => e instanceof DatabaseSchemaError && /0001_stories\.sql/.test(e.message) && /stories/.test(e.message));
});

test('Supabase: missing lock functions say to run the migration too', async () => {
  const { repo } = make({ missingTables: ['rpc'] });

  await assert.rejects(() => repo.acquireLock(), (e) => e instanceof DatabaseSchemaError && /0001_stories\.sql/.test(e.message));
});

test('Supabase: verify checks every table and the lock functions, without taking the lock', async () => {
  const { fake, repo } = make();
  await repo.verify();

  const paths = fake.requests.map((r) => new URL(r.url).pathname);
  for (const table of ['stories', 'rejected_topics', 'generation_lock', 'generation_runs']) {
    assert.ok(paths.includes(`/rest/v1/${table}`), `${table} was not checked`);
  }
  assert.ok(paths.includes('/rest/v1/rpc/release_generation_lock'));
  assert.equal(paths.includes('/rest/v1/rpc/acquire_generation_lock'), false, 'checking must not take the run lock');
  assert.equal(fake.tables.generation_lock.length, 0);
});

test('Supabase: verify names what is missing when the migration has not been run', async () => {
  const { repo } = make({ missingTables: ['rejected_topics'] });

  await assert.rejects(() => repo.verify(), (e) => e instanceof DatabaseSchemaError && /rejected_topics/.test(e.message));
});

test('Supabase: verify reports a rejected key', async () => {
  const fake = createFakePostgrest({ serviceKey: KEY });
  const repo = createSupabaseRepository({ url: URL_, serviceKey: 'sb_secret_' + 'W'.repeat(32), fetchImpl: fake.fetchImpl, retry: fastRetry });

  await assert.rejects(() => repo.verify(), (e) => e instanceof AuthError);
});

test('Supabase: a brief outage is retried and then succeeds', async () => {
  const { fake, repo } = make({ failFirst: [503, 429] });

  assert.deepEqual((await repo.list()).valid, []);
  assert.equal(fake.requests.length, 3);
});

test('Supabase: a lasting outage stops with a try-again-later message', async () => {
  const { repo } = make({ failFirst: [503, 503, 503, 503] });

  await assert.rejects(() => repo.list(), (e) => e instanceof PipelineAbort && /try again later/i.test(e.message));
});

test('Supabase: a lock left by a run that died is taken over after the stale limit', async () => {
  const { fake, repo } = make();
  await repo.acquireLock(); // never released: the run "died"

  await assert.rejects(() => repo.acquireLock(), /already in progress/i);
  fake.advance(31 * 60 * 1000);
  const taken = await repo.acquireLock();
  await taken.release();
});

test('Supabase: releasing a lock that someone else now holds leaves it alone', async () => {
  const { fake, repo } = make();
  const mine = await repo.acquireLock();
  fake.advance(31 * 60 * 1000);
  const theirs = await repo.acquireLock(); // took over the stale lock

  await mine.release(); // must not free their lock
  await assert.rejects(() => repo.acquireLock(), /already in progress/i);
  await theirs.release();
});

test('Supabase: a failed lock release never throws out of a finished run', async () => {
  const fake = createFakePostgrest({ serviceKey: KEY });
  let networkDown = false;
  const repo = createSupabaseRepository({
    url: URL_,
    serviceKey: KEY,
    fetchImpl: async (u, i) => {
      if (networkDown) throw new TypeError('fetch failed');
      return fake.fetchImpl(u, i);
    },
    retry: { ...fastRetry, retries: 0 },
  });

  const lock = await repo.acquireLock();
  networkDown = true; // the connection drops just as the run finishes

  await assert.doesNotReject(() => lock.release());
});

test('Supabase: a run record carries the status, id and details', async () => {
  const { fake, repo } = make();
  await repo.recordRun({ startedAt: '2026-10-22T10:00:00Z', finishedAt: '2026-10-22T10:01:00Z', status: 'published', publishedId: 'abc', details: { usage: { calls: 3 } } });

  assert.deepEqual(fake.tables.generation_runs[0], {
    id: 1,
    started_at: '2026-10-22T10:00:00Z',
    finished_at: '2026-10-22T10:01:00Z',
    status: 'published',
    published_id: 'abc',
    details: { usage: { calls: 3 } },
  });
});

test('Supabase: the stored row carries the summary columns the feed needs', async () => {
  const { fake, repo } = make();
  await repo.save(gen({ id: 'row-check', title: 'Row check' }));

  const row = fake.tables.stories[0];
  assert.equal(row.id, 'row-check');
  assert.equal(row.date, '2026-10-20');
  assert.equal(row.source_title, VERIFIED_STORIES[0].source.title);
  assert.deepEqual(row.related_topics, VERIFIED_STORIES[0].relatedTopics);
  assert.equal(row.data.title, 'Row check');
});

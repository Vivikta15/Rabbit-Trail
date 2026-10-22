const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Runs the real migration against a real Postgres engine (PGlite: Postgres compiled to WebAssembly), so the SQL
// is tested, not just read. The Supabase roles it refers to are created first, as Supabase does.
const MIGRATION = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '0001_stories.sql'), 'utf-8');
const OWNER_A = '11111111-1111-1111-1111-111111111111';
const OWNER_B = '22222222-2222-2222-2222-222222222222';

async function freshDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
  await db.exec(MIGRATION);
  return db;
}

const storyRow = (over = {}) => {
  const id = over.id ?? 'story-one';
  return {
    id,
    date: '2026-10-20',
    title: 'T',
    topic: 'Topic',
    era: 'Era',
    source_title: over.source_title ?? 'Source One',
    related_topics: ['A', 'B'],
    data: { id, title: 'T' },
    ...over,
  };
};

async function insertStory(db, row) {
  await db.query(
    'insert into public.stories (id, date, title, topic, era, source_title, related_topics, data) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [row.id, row.date, row.title, row.topic, row.era, row.source_title, row.related_topics, JSON.stringify(row.data)],
  );
}

const rejects = (promise, pattern) => assert.rejects(promise, pattern);

test('Migration - applies cleanly and can be run again without harm', async () => {
  const db = await freshDb();

  await db.exec(MIGRATION); // a second run must change nothing and not fail
  const { rows } = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  assert.equal(rows[0].n, 4);
});

test('Migration - every table has row-level security on, and no policy opens it', async () => {
  const db = await freshDb();

  const { rows } = await db.query(
    "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname",
  );
  assert.deepEqual(rows.map((r) => r.relname), ['generation_lock', 'generation_runs', 'rejected_topics', 'stories']);
  assert.ok(rows.every((r) => r.relrowsecurity === true), 'row-level security must be on for every table');

  const policies = await db.query("select count(*)::int as n from pg_policies where schemaname = 'public'");
  assert.equal(policies.rows[0].n, 0, 'there must be no policy that opens a table to the public key');
});

test('Migration - the public and signed-in roles can do nothing; only the service role can run the lock functions', async () => {
  const db = await freshDb();

  for (const table of ['stories', 'rejected_topics', 'generation_lock', 'generation_runs']) {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        const { rows } = await db.query('select has_table_privilege($1, $2, $3) as ok', [role, `public.${table}`, priv]);
        assert.equal(rows[0].ok, false, `${role} must not ${priv} ${table}`);
      }
    }
  }
  for (const fn of ['public.acquire_generation_lock(uuid, integer)', 'public.release_generation_lock(uuid)']) {
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await db.query('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute']);
      assert.equal(rows[0].ok, false, `${role} must not execute ${fn}`);
    }
    const { rows } = await db.query('select has_function_privilege($1, $2, $3) as ok', ['service_role', fn, 'execute']);
    assert.equal(rows[0].ok, true);
  }
});

test('Stories table - accepts the row the app writes and keeps the list columns', async () => {
  const db = await freshDb();
  await insertStory(db, storyRow());

  const { rows } = await db.query('select id, date::text as date, related_topics, data from public.stories');
  assert.equal(rows[0].id, 'story-one');
  assert.equal(rows[0].date, '2026-10-20');
  assert.deepEqual(rows[0].related_topics, ['A', 'B']);
  assert.equal(rows[0].data.title, 'T');
});

test('Stories table - refuses unsafe ids, mismatched records and non-object data', async () => {
  const db = await freshDb();

  for (const id of ['../evil', 'UPPER', 'a/b', '', '-leading-dash']) {
    await rejects(insertStory(db, storyRow({ id, data: { id } })), /check|violates/i);
  }
  await rejects(insertStory(db, storyRow({ id: 'good-id', data: { id: 'another-id' } })), /check|violates/i);
  // A story with no id at all, and a JSON value that is not an object, must both be refused.
  await rejects(db.query("insert into public.stories (id,date,title,topic,era,source_title,data) values ('no-id','2026-10-20','t','t','e','s1','{}')"), /check|violates/i);
  await rejects(db.query("insert into public.stories (id,date,title,topic,era,source_title,data) values ('as-array','2026-10-20','t','t','e','s2','[]')"), /check|violates/i);

  const { rows } = await db.query('select count(*)::int as n from public.stories');
  assert.equal(rows[0].n, 0);
});

test('Stories table - the same id or the same source page cannot be stored twice', async () => {
  const db = await freshDb();
  await insertStory(db, storyRow({ id: 'one', source_title: 'Battle of Lepanto' }));

  await rejects(insertStory(db, storyRow({ id: 'one', source_title: 'Different' })), /duplicate key|unique/i);
  await rejects(insertStory(db, storyRow({ id: 'two', source_title: 'battle of lepanto' })), /duplicate key|unique/i);
  await insertStory(db, storyRow({ id: 'three', source_title: 'Another Page' })); // a different page is fine
});

test('Stories table - listing order is by date then id, as the app asks for it', async () => {
  const db = await freshDb();
  await insertStory(db, storyRow({ id: 'b', date: '2026-10-22', source_title: 'sb' }));
  await insertStory(db, storyRow({ id: 'a', date: '2026-10-22', source_title: 'sa' }));
  await insertStory(db, storyRow({ id: 'c', date: '2026-10-17', source_title: 'sc' }));

  const { rows } = await db.query('select id from public.stories order by date asc, id asc');
  assert.deepEqual(rows.map((r) => r.id), ['c', 'a', 'b']);
});

test('Rejected topics - one row per lower-cased title', async () => {
  const db = await freshDb();
  await db.query("insert into public.rejected_topics (title_lower, title, reason, date) values ('boring page','Boring Page','no','2026-10-22')");

  await rejects(db.query("insert into public.rejected_topics (title_lower, title, reason, date) values ('boring page','Boring Page','again','2026-10-23')"), /duplicate key/i);
});

test('Run lock - one owner at a time; a second owner is refused', async () => {
  const db = await freshDb();
  const acquire = async (owner, stale = 1800) => (await db.query('select public.acquire_generation_lock($1::uuid, $2) as ok', [owner, stale])).rows[0].ok;

  assert.equal(await acquire(OWNER_A), true);
  assert.equal(await acquire(OWNER_B), false);
  assert.equal(await acquire(OWNER_A), true, 'the holder asking again still holds it');
});

test('Run lock - a lock older than the stale limit is taken over, a fresh one is not', async () => {
  const db = await freshDb();
  const acquire = async (owner, stale = 1800) => (await db.query('select public.acquire_generation_lock($1::uuid, $2) as ok', [owner, stale])).rows[0].ok;
  await acquire(OWNER_A);

  await db.query("update public.generation_lock set started_at = now() - interval '29 minutes'");
  assert.equal(await acquire(OWNER_B), false, '29 minutes is still within the limit');

  await db.query("update public.generation_lock set started_at = now() - interval '31 minutes'");
  assert.equal(await acquire(OWNER_B), true, '31 minutes means the run is presumed dead');
  assert.equal(await acquire(OWNER_A), false, 'the old owner has lost it');
});

test('Run lock - only the owner can release it', async () => {
  const db = await freshDb();
  const acquire = async (owner) => (await db.query('select public.acquire_generation_lock($1::uuid, 1800) as ok', [owner])).rows[0].ok;
  const release = (owner) => db.query('select public.release_generation_lock($1::uuid)', [owner]);
  await acquire(OWNER_A);

  await release(OWNER_B);
  assert.equal(await acquire(OWNER_B), false, "someone else's release must not free the lock");

  await release(OWNER_A);
  assert.equal(await acquire(OWNER_B), true, 'after the owner releases, others can take it');
  await release(OWNER_B);
  await release(OWNER_B); // releasing twice is harmless
});

test('Run log - rows get increasing ids and keep their details', async () => {
  const db = await freshDb();
  for (const status of ['published', 'failed']) {
    await db.query("insert into public.generation_runs (started_at, finished_at, status, published_id, details) values ('2026-10-22T10:00:00Z','2026-10-22T10:01:00Z',$1,null,$2)", [status, JSON.stringify({ usage: { calls: 2 } })]);
  }

  const { rows } = await db.query('select id::int as id, status, details from public.generation_runs order by id');
  assert.deepEqual(rows.map((r) => [r.id, r.status]), [[1, 'published'], [2, 'failed']]);
  assert.equal(rows[0].details.usage.calls, 2);
});

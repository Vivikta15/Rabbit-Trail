const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '0003_launch_growth.sql'), 'utf-8');
const VISITOR = '11111111-1111-1111-1111-111111111111';

async function freshDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
  await db.exec(MIGRATION);
  return db;
}

const event = (db, over = {}) =>
  db.query('insert into public.launch_events (day, name, visitor, source) values ($1, $2, $3, $4)', [over.day ?? '2026-10-28', over.name ?? 'visit', over.visitor ?? VISITOR, over.source ?? 'direct']);

test('Launch migration - applies cleanly and can be run again', async () => {
  const db = await freshDb();

  await db.exec(MIGRATION);
  const { rows } = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  assert.equal(rows[0].n, 2);
});

test('Launch migration - closed to the public: security on, no policy, no grants', async () => {
  const db = await freshDb();

  for (const table of ['launch_events', 'social_posts']) {
    const { rows } = await db.query('select relrowsecurity from pg_class where oid = $1::regclass', [`public.${table}`]);
    assert.equal(rows[0].relrowsecurity, true, table);
    const policies = await db.query('select count(*)::int as n from pg_policies where tablename = $1', [table]);
    assert.equal(policies.rows[0].n, 0, table);
    for (const role of ['anon', 'authenticated']) {
      const grants = await db.query('select count(*)::int as n from information_schema.role_table_grants where table_name = $1 and grantee = $2', [table, role]);
      assert.equal(grants.rows[0].n, 0, `${role} on ${table}`);
    }
  }
});

test('Launch events - one row per visitor, step and day; a new day or step is a new row', async () => {
  const db = await freshDb();

  await event(db);
  await assert.rejects(() => event(db), /duplicate key|unique/i);
  await event(db, { day: '2026-10-29' });
  await event(db, { name: 'quiz_started' });
  await event(db, { visitor: '22222222-2222-2222-2222-222222222222' });
  const { rows } = await db.query('select count(*)::int as n from public.launch_events');
  assert.equal(rows[0].n, 4);
});

test('Launch events - only known steps and tidy channel names are accepted', async () => {
  const db = await freshDb();

  await assert.rejects(() => event(db, { name: 'purchase' }), /check/i);
  await assert.rejects(() => event(db, { source: 'Bad Source!' }), /check/i);
  await assert.rejects(() => event(db, { source: 'x'.repeat(31) }), /check/i);
  await assert.rejects(() => event(db, { source: '' }), /check/i);
  await event(db, { source: 'hacker-news' });
});

test('Social posts - one post per story and channel, and only known channels', async () => {
  const db = await freshDb();
  const post = (story, channel) => db.query('insert into public.social_posts (story_id, channel) values ($1, $2)', [story, channel]);

  await post('story-battle-of-lepanto', 'telegram');
  await post('story-battle-of-lepanto', 'bluesky');
  await assert.rejects(() => post('story-battle-of-lepanto', 'telegram'), /duplicate key|unique/i);
  await assert.rejects(() => post('story-x', 'myspace'), /check/i);
  await assert.rejects(() => post('Bad Id!', 'telegram'), /check/i);
});

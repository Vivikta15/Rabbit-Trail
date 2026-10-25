const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Runs the real migration against a real Postgres engine (PGlite). Supabase provides the auth schema and its roles,
// so a minimal stand-in for them is created first.
const MIGRATION = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '0002_reader_state.sql'), 'utf-8');
const USER_A = '11111111-1111-1111-1111-111111111111';

async function freshDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
  await db.exec('create schema auth; create table auth.users (id uuid primary key);');
  await db.exec(`insert into auth.users (id) values ('${USER_A}')`);
  await db.exec(MIGRATION);
  return db;
}

const insert = (db, over = {}) =>
  db.query('insert into public.reader_state (user_id, archetype, activity) values ($1, $2, $3)', [
    over.user_id ?? USER_A,
    over.archetype ?? 'detective',
    JSON.stringify(over.activity ?? []),
  ]);

test('Reader state migration - applies cleanly and can be run again', async () => {
  const db = await freshDb();

  await db.exec(MIGRATION);
  const { rows } = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  assert.equal(rows[0].n, 1);
});

test('Reader state migration - row-level security is on with no policy, and the public roles have no access', async () => {
  const db = await freshDb();

  const { rows } = await db.query("select relrowsecurity from pg_class where oid = 'public.reader_state'::regclass");
  assert.equal(rows[0].relrowsecurity, true);
  const policies = await db.query("select count(*)::int as n from pg_policies where tablename = 'reader_state'");
  assert.equal(policies.rows[0].n, 0);

  for (const role of ['anon', 'authenticated']) {
    const grants = await db.query("select count(*)::int as n from information_schema.role_table_grants where table_name = 'reader_state' and grantee = $1", [role]);
    assert.equal(grants.rows[0].n, 0, `${role} must hold no grant on reader_state`);
  }
});

test('Reader state migration - a reader is a real Auth user, and deleting the account deletes the data', async () => {
  const db = await freshDb();

  await assert.rejects(() => insert(db, { user_id: '99999999-9999-9999-9999-999999999999' }), /foreign key|violates/i);
  await insert(db);
  await db.exec(`delete from auth.users where id = '${USER_A}'`);
  const { rows } = await db.query('select count(*)::int as n from public.reader_state');
  assert.equal(rows[0].n, 0);
});

test('Reader state migration - one row per reader, a new reader starts unsubscribed, bad shapes are refused', async () => {
  const db = await freshDb();

  await insert(db);
  await assert.rejects(() => insert(db), /duplicate key|unique/i);
  const { rows } = await db.query('select subscribed from public.reader_state');
  assert.equal(rows[0].subscribed, false, 'nobody starts out as a paying subscriber');

  const other = await freshDb();
  await assert.rejects(() => insert(other, { archetype: "x'; drop table--" }), /check/i);
  await assert.rejects(() => insert(other, { activity: { not: 'an array' } }), /check/i);
  await assert.rejects(() => insert(other, { activity: Array.from({ length: 5001 }, () => ({})) }), /check/i);
});

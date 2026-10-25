const test = require('node:test');
const assert = require('node:assert/strict');

const { handleReaderRequest } = require('../dist/lib/accounts/reader-api.js');
const { createFakePostgrest } = require('./helpers/fake-postgrest.js');

const URL = 'https://abcdefghij.supabase.co';
const SERVICE = 'sb_secret_' + 'S'.repeat(26) + 'wxyz';
const ALICE = { id: '11111111-1111-1111-1111-111111111111', email: 'alice@example.com' };
const BOB = { id: '22222222-2222-2222-2222-222222222222', email: 'bob@example.com' };
const TODAY = '2026-10-24';
const env = { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE };

const story = (date, storyId, readCounterArgument = false) => ({ type: 'story', date, storyId, topic: 'Topic', era: 'Era', readCounterArgument });

function setup(options = {}) {
  const fake = createFakePostgrest({ serviceKey: SERVICE, users: { 'alice-token': ALICE, 'bob-token': BOB }, ...options });
  const call = (method, { token = 'alice-token', body, rawBody, e = env } = {}) =>
    handleReaderRequest({
      method,
      authorization: token === null ? null : `Bearer ${token}`,
      bodyText: rawBody ?? (body === undefined ? '' : JSON.stringify(body)),
      env: e,
      today: TODAY,
      fetchImpl: fake.fetchImpl,
    });
  return { fake, call };
}

test('Reader API - nobody who is not signed in can read or write', async () => {
  const { call, fake } = setup();

  assert.equal((await call('GET', { token: null })).status, 401);
  assert.equal((await call('PUT', { token: null, body: {} })).status, 401);
  assert.equal((await call('GET', { token: 'forged-token' })).status, 401);
  assert.equal(fake.tables.reader_state.length, 0);
  assert.equal(fake.requests.filter((r) => r.url.includes('/rest/v1/')).length, 0, 'the database is never touched for a stranger');
});

test('Reader API - a new reader starts with an empty, unsubscribed state', async () => {
  const { call } = setup();

  const r = await call('GET');

  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { state: { archetype: null, trialStartDate: null, activity: [] }, subscribed: false });
});

test('Reader API - saving stores the cleaned state under the verified reader, and reading gives it back', async () => {
  const { call, fake } = setup();

  const put = await call('PUT', { body: { archetype: 'detective', trialStartDate: '2026-10-20', activity: [story('2026-10-21', 'a')] } });
  const get = await call('GET');

  assert.equal(put.status, 200);
  assert.deepEqual(get.body.state, { archetype: 'detective', trialStartDate: '2026-10-20', activity: [story('2026-10-21', 'a')] });
  assert.equal(fake.tables.reader_state.length, 1);
  assert.equal(fake.tables.reader_state[0].user_id, ALICE.id);
});

test('Reader API - saving merges with what is already saved, so a second device adds to it', async () => {
  const { call } = setup();

  await call('PUT', { body: { trialStartDate: '2026-10-20', activity: [story('2026-10-21', 'a')] } });
  const second = await call('PUT', { body: { trialStartDate: '2026-10-23', activity: [story('2026-10-22', 'b')] } });

  assert.deepEqual(second.body.state.activity.map((e) => e.storyId).sort(), ['a', 'b']);
  assert.equal(second.body.state.trialStartDate, '2026-10-20', 'the trial start can never be moved later');
});

test('Reader API - one reader can never see or change another reader\'s data', async () => {
  const { call, fake } = setup();

  await call('PUT', { body: { archetype: 'detective', activity: [story('2026-10-21', 'alice-secret')] } });
  const bobSees = await call('GET', { token: 'bob-token' });
  await call('PUT', { token: 'bob-token', body: { user_id: ALICE.id, userId: ALICE.id, activity: [story('2026-10-22', 'bob')] } });

  assert.deepEqual(bobSees.body.state.activity, []);
  assert.equal(JSON.stringify(bobSees.body).includes('alice-secret'), false);
  const alice = fake.tables.reader_state.find((r) => r.user_id === ALICE.id);
  assert.deepEqual(alice.activity.map((e) => e.storyId), ['alice-secret'], 'Bob\'s write never touched Alice\'s row');
  assert.ok(fake.tables.reader_state.find((r) => r.user_id === BOB.id), 'it went to Bob\'s own row');
});

test('Reader API - a browser can never mark itself as a paying subscriber', async () => {
  const { call, fake } = setup();

  const put = await call('PUT', { body: { isSubscribed: true, subscribed: true, activity: [] } });

  assert.equal(put.body.subscribed, false);
  assert.equal(fake.tables.reader_state[0].subscribed, undefined, 'the column is not even written, so a server-set value is never overwritten');
  fake.tables.reader_state[0].subscribed = true; // as the payment step will do, server side
  assert.equal((await call('GET')).body.subscribed, true);
  const again = await call('PUT', { body: { isSubscribed: false, subscribed: false } });
  assert.equal(again.body.subscribed, true, 'a later save leaves the paid state alone');
});

test('Reader API - bad requests are refused without touching the database', async () => {
  const { call, fake } = setup();

  assert.equal((await call('PUT', { rawBody: '{not json' })).status, 400);
  assert.equal((await call('PUT', { rawBody: 'x'.repeat(700 * 1024) })).status, 413);
  assert.equal((await call('DELETE')).status, 405);
  assert.equal(fake.tables.reader_state.length, 0);
});

test('Reader API - Supabase being down gives a calm "try again", with no internals', async () => {
  const { call } = setup({ authStatus: 503 });

  const r = await call('GET');

  assert.equal(r.status, 503);
  assert.match(r.body.error, /try again/i);
  assert.equal(JSON.stringify(r.body).includes('503'), false);
  assert.equal(JSON.stringify(r.body).includes(SERVICE), false);
});

test('Reader API - saving needs the Supabase backend, and says so', async () => {
  const { call } = setup();

  const r = await call('GET', { e: {} });

  assert.equal(r.status, 503);
  assert.match(r.body.error, /not available|not set up/i);
});

test('Reader API - a missing table points at the migration, not at a crash', async () => {
  const { call } = setup({ missingTables: ['reader_state'] });

  const r = await call('GET');

  assert.equal(r.status, 503);
  assert.equal(JSON.stringify(r.body).includes('reader_state'), false, 'internals stay in the server log');
});

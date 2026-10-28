const test = require('node:test');
const assert = require('node:assert/strict');

const { EVENT_NAMES, cleanSource, sourceFromSearch, cleanEvent, shouldTrack, summarizeEvents } = require('../dist/lib/analytics/events.js');
const { createTracker } = require('../dist/lib/analytics/tracker.js');
const { handleEventRequest } = require('../dist/lib/analytics/events-api.js');
const { createFakePostgrest } = require('./helpers/fake-postgrest.js');

const V1 = '11111111-1111-1111-1111-111111111111';
const V2 = '22222222-2222-2222-2222-222222222222';
const URL = 'https://abcdefghij.supabase.co';
const SERVICE = 'sb_secret_' + 'S'.repeat(26) + 'wxyz';
const env = { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE };

// ---- cleaning what a browser sends ----------------------------------------------------------------------------------

test('Source - tidy names are kept, anything else becomes "direct"', () => {
  assert.equal(cleanSource('hacker-news'), 'hacker-news');
  assert.equal(cleanSource(' Reddit '), 'reddit');
  for (const bad of [undefined, null, '', 'a b', 'x'.repeat(31), '<script>', '../etc', 'ünï', 42, {}]) assert.equal(cleanSource(bad), 'direct', String(bad));
});

test('Source - read from the address: utm_source first, then ref, else direct', () => {
  assert.equal(sourceFromSearch('?utm_source=telegram&x=1'), 'telegram');
  assert.equal(sourceFromSearch('?ref=producthunt'), 'producthunt');
  assert.equal(sourceFromSearch('?utm_source=reddit&ref=x'), 'reddit');
  assert.equal(sourceFromSearch(''), 'direct');
  assert.equal(sourceFromSearch('?utm_source=Bad Source!'), 'direct');
});

test('Event - only a known step with a real visitor id is accepted', () => {
  assert.deepEqual(cleanEvent({ name: 'visit', visitor: V1, source: 'reddit' }), { name: 'visit', visitor: V1, source: 'reddit' });
  assert.equal(cleanEvent({ name: 'visit', visitor: V1 }).source, 'direct');
  for (const bad of [null, 'x', [], {}, { name: 'purchase', visitor: V1 }, { name: 'visit', visitor: 'nope' }, { name: 'visit' }, { visitor: V1 }]) {
    assert.equal(cleanEvent(bad), null, JSON.stringify(bad));
  }
  assert.ok(EVENT_NAMES.includes('quiz_completed'));
});

test('Event - extra fields a browser adds are dropped', () => {
  const e = cleanEvent({ name: 'visit', visitor: V1, source: 'x', email: 'a@b.co', ip: '1.2.3.4' });
  assert.deepEqual(Object.keys(e).sort(), ['name', 'source', 'visitor']);
});

test('Privacy - Do Not Track and Global Privacy Control switch counting off', () => {
  assert.equal(shouldTrack({}), true);
  assert.equal(shouldTrack({ doNotTrack: '1' }), false);
  assert.equal(shouldTrack({ doNotTrack: 'yes' }), false);
  assert.equal(shouldTrack({ globalPrivacyControl: true }), false);
  assert.equal(shouldTrack({ doNotTrack: '0' }), true);
  assert.equal(shouldTrack({ doNotTrack: null, globalPrivacyControl: false }), true);
});

// ---- counting the funnel -------------------------------------------------------------------------------------------------

const row = (name, visitor, source = 'direct', day = '2026-10-28') => ({ name, visitor, source, day });

test('Funnel - counts people, not events: one person on two days is one person', () => {
  const s = summarizeEvents([row('visit', V1, 'reddit', '2026-10-28'), row('visit', V1, 'reddit', '2026-10-29'), row('visit', V2, 'reddit')]);

  assert.equal(s.total.visit, 2);
  assert.equal(s.bySource.find((r) => r.source === 'reddit').visit, 2);
});

test('Funnel - each channel gets its own row, busiest first, with a total', () => {
  const s = summarizeEvents([
    row('visit', V1, 'reddit'),
    row('quiz_completed', V1, 'reddit'),
    row('visit', V2, 'telegram'),
    row('visit', '33333333-3333-3333-3333-333333333333', 'reddit'),
  ]);

  assert.deepEqual(s.bySource.map((r) => r.source), ['reddit', 'telegram']);
  assert.equal(s.bySource[0].quiz_completed, 1);
  assert.equal(s.total.visit, 3);
  assert.equal(s.total.quiz_completed, 1);
  assert.equal(s.total.shared, 0);
});

test('Funnel - no events gives a clean empty summary', () => {
  const s = summarizeEvents([]);
  assert.deepEqual(s.bySource, []);
  assert.equal(s.total.visit, 0);
});

// ---- the browser side ----------------------------------------------------------------------------------------------------

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m };
};
const tracker = (over = {}) => {
  const sent = [];
  const storage = over.storage === undefined ? memory() : over.storage;
  let n = 0;
  const t = createTracker({
    storage,
    send: (e) => sent.push(e),
    search: over.search ?? '',
    today: over.today ?? '2026-10-28',
    allowed: over.allowed ?? true,
    newId: () => (n++ === 0 ? V1 : V2),
  });
  return { t, sent, storage };
};

test('Tracker - sends the step with a stable random visitor id and the channel', () => {
  const { t, sent } = tracker({ search: '?utm_source=telegram' });

  t.track('visit');
  t.track('quiz_started');

  assert.deepEqual(sent, [
    { name: 'visit', visitor: V1, source: 'telegram' },
    { name: 'quiz_started', visitor: V1, source: 'telegram' },
  ]);
});

test('Tracker - the first channel wins: a later visit from elsewhere does not change who sent this person', () => {
  const storage = memory();
  tracker({ storage, search: '?utm_source=reddit' }).t.track('visit');
  const second = tracker({ storage, search: '?utm_source=telegram', today: '2026-10-29' });

  second.t.track('visit');

  assert.equal(second.sent[0].source, 'reddit');
  assert.equal(second.sent[0].visitor, V1, 'the same browser keeps its id');
});

test('Tracker - the same step is sent once a day, and again the next day', () => {
  const storage = memory();
  const a = tracker({ storage });
  a.t.track('visit');
  a.t.track('visit');
  assert.equal(a.sent.length, 1);

  const b = tracker({ storage, today: '2026-10-29' });
  b.t.track('visit');
  assert.equal(b.sent.length, 1);
});

test('Tracker - sends nothing when the reader has asked not to be tracked, and stores nothing', () => {
  const { t, sent, storage } = tracker({ allowed: false });

  t.track('visit');

  assert.equal(sent.length, 0);
  assert.equal(storage.m.size, 0);
});

test('Tracker - works without storage, and a storage that throws never breaks the page', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  for (const storage of [null, broken]) {
    const { t, sent } = tracker({ storage });
    assert.doesNotThrow(() => t.track('visit'));
    assert.equal(sent.length, 1);
  }
});

test('Tracker - a failing send never throws into the page', () => {
  const t = createTracker({ storage: memory(), send: () => { throw new Error('offline'); }, search: '', today: '2026-10-28', allowed: true, newId: () => V1 });
  assert.doesNotThrow(() => t.track('visit'));
});

// ---- the server side -----------------------------------------------------------------------------------------------------

function setup(options = {}) {
  const fake = createFakePostgrest({ serviceKey: SERVICE, ...options });
  const call = (body, over = {}) =>
    handleEventRequest({
      method: over.method ?? 'POST',
      bodyText: typeof body === 'string' ? body : JSON.stringify(body),
      origin: over.origin === undefined ? 'https://rabbittrail.vercel.app' : over.origin,
      host: 'rabbittrail.vercel.app',
      env: over.env ?? env,
      today: over.today ?? '2026-10-28',
      fetchImpl: fake.fetchImpl,
      log: () => {},
    });
  return { fake, call };
}

test('Events API - a valid event is stored with only the day, step, visitor and channel', async () => {
  const { fake, call } = setup();

  const r = await call({ name: 'quiz_completed', visitor: V1, source: 'reddit', email: 'a@b.co' });

  assert.equal(r.status, 204);
  assert.equal(fake.tables.launch_events.length, 1);
  assert.deepEqual(Object.keys(fake.tables.launch_events[0]).sort(), ['day', 'name', 'source', 'visitor']);
  assert.equal(fake.tables.launch_events[0].day, '2026-10-28');
});

test('Events API - repeating an event the same day is quietly ignored, a new day is stored', async () => {
  const { fake, call } = setup();
  const e = { name: 'visit', visitor: V1, source: 'direct' };

  assert.equal((await call(e)).status, 204);
  assert.equal((await call(e)).status, 204, 'a duplicate is not an error');
  assert.equal((await call(e, { today: '2026-10-29' })).status, 204);

  assert.equal(fake.tables.launch_events.length, 2);
});

test('Events API - bad requests are refused and nothing is written', async () => {
  const { fake, call } = setup();

  assert.equal((await call({ name: 'purchase', visitor: V1 })).status, 400);
  assert.equal((await call({ name: 'visit', visitor: 'nope' })).status, 400);
  assert.equal((await call('{not json')).status, 400);
  assert.equal((await call('x'.repeat(5000))).status, 413);
  assert.equal((await call({}, { method: 'GET' })).status, 405);
  assert.equal(fake.tables.launch_events.length, 0);
});

test('Events API - a request from another website is refused', async () => {
  const { fake, call } = setup();

  assert.equal((await call({ name: 'visit', visitor: V1 }, { origin: 'https://evil.example' })).status, 403);
  assert.equal(fake.tables.launch_events.length, 0);
  assert.equal((await call({ name: 'visit', visitor: V1 }, { origin: null })).status, 204, 'no Origin header (a plain beacon) is fine');
});

test('Events API - without the Supabase backend counting is simply off, never an error', async () => {
  const { fake, call } = setup();

  const r = await call({ name: 'visit', visitor: V1 }, { env: {} });

  assert.equal(r.status, 204);
  assert.equal(fake.tables.launch_events.length, 0);
});

test('Events API - a database problem gives a plain 503 with no internals', async () => {
  const { call } = setup({ missingTables: ['launch_events'] });

  const r = await call({ name: 'visit', visitor: V1 });

  assert.equal(r.status, 503);
  assert.equal(JSON.stringify(r.body ?? {}).includes('launch_events'), false);
});

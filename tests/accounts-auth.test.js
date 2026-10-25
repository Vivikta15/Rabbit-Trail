const test = require('node:test');
const assert = require('node:assert/strict');

const { extractBearer, verifyAccessToken, validatePublishableKey, loadAuthConfig, AccountsUnavailable } = require('../dist/lib/accounts/auth.js');

const URL = 'https://abcdefghij.supabase.co';
const SERVICE = 'sb_secret_' + 'S'.repeat(26) + 'wxyz';
const PUBLISHABLE = 'sb_publishable_' + 'P'.repeat(26) + 'abcd';
const USER = '11111111-1111-1111-1111-111111111111';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.${'s'.repeat(20)}`;

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });

// ---- reading the token from a request ---------------------------------------------------------------------------------

test('Bearer - only a well-formed Authorization header gives a token', () => {
  assert.equal(extractBearer('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearer('bearer abc.def.ghi'), 'abc.def.ghi');
  for (const bad of [null, undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'abc.def.ghi', 'Bearer a b', `Bearer ${'x'.repeat(5000)}`]) {
    assert.equal(extractBearer(bad), null, String(bad).slice(0, 20));
  }
});

// ---- asking Supabase who the token belongs to --------------------------------------------------------------------------

test('Verify - Supabase vouches for a good token, and the call carries the reader token and the server key', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return res(200, { id: USER, email: 'reader@example.com' });
  };

  const who = await verifyAccessToken({ url: URL, serviceKey: SERVICE, token: 'tok', fetchImpl });

  assert.deepEqual(who, { userId: USER, email: 'reader@example.com' });
  assert.equal(calls[0].url, `${URL}/auth/v1/user`);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.headers.apikey, SERVICE);
  assert.equal(calls[0].init.cache, 'no-store');
});

test('Verify - a rejected or expired token is simply "not signed in"', async () => {
  for (const status of [400, 401, 403]) {
    assert.equal(await verifyAccessToken({ url: URL, serviceKey: SERVICE, token: 'bad', fetchImpl: async () => res(status, { msg: 'invalid JWT' }) }), null);
  }
});

test('Verify - an answer that is not a real user is refused, never trusted', async () => {
  for (const body of [{}, { id: 'not-a-uuid' }, { id: 42 }, null, 'x']) {
    assert.equal(await verifyAccessToken({ url: URL, serviceKey: SERVICE, token: 't', fetchImpl: async () => res(200, body) }), null);
  }
});

test('Verify - an outage is reported as an outage, not as "signed out"', async () => {
  await assert.rejects(() => verifyAccessToken({ url: URL, serviceKey: SERVICE, token: 't', fetchImpl: async () => res(503, {}) }), AccountsUnavailable);
  await assert.rejects(
    () => verifyAccessToken({ url: URL, serviceKey: SERVICE, token: 't', fetchImpl: async () => { throw new Error('socket hang up'); } }),
    AccountsUnavailable,
  );
});

// ---- which key may reach a browser ------------------------------------------------------------------------------------

test('Public key - a publishable key or an anon JWT is accepted', () => {
  assert.deepEqual(validatePublishableKey(PUBLISHABLE), { ok: true, key: PUBLISHABLE });
  const anon = jwt('anon');
  assert.deepEqual(validatePublishableKey(` ${anon} `), { ok: true, key: anon });
});

test('Public key - a SECRET key is refused in every form, so it can never be sent to a browser', () => {
  for (const secret of [SERVICE, jwt('service_role'), 'sb_secret_short']) {
    const r = validatePublishableKey(secret);
    assert.equal(r.ok, false, secret.slice(0, 16));
    assert.match(r.problem, /secret|service/i);
    assert.equal(r.problem.includes(secret), false, 'the message never repeats the key');
  }
});

test('Public key - empty, placeholder and malformed values are refused', () => {
  for (const bad of [undefined, '', '  ', 'your-key-here', 'short', 'sb_publishable_ has space', 'a'.repeat(30)]) {
    assert.equal(validatePublishableKey(bad).ok, false, String(bad));
  }
});

test('Auth config - sign-in is on only when the project URL and a public key are both set', () => {
  const on = loadAuthConfig({ SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  assert.deepEqual(on, { enabled: true, url: URL, publishableKey: PUBLISHABLE });

  assert.equal(loadAuthConfig({ SUPABASE_URL: URL }).enabled, false);
  assert.equal(loadAuthConfig({ SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }).enabled, false);
  assert.equal(loadAuthConfig({}).enabled, false);
});

test('Auth config - a secret key in the public slot turns sign-in off instead of leaking it', () => {
  const r = loadAuthConfig({ SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEY: SERVICE, SUPABASE_SERVICE_ROLE_KEY: SERVICE });

  assert.equal(r.enabled, false);
  assert.equal(JSON.stringify(r).includes(SERVICE), false);
  assert.equal(JSON.stringify(r).includes('S'.repeat(26)), false);
});

test('Auth config - the same key in both slots is refused even if it looks public', () => {
  const r = loadAuthConfig({ SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SERVICE_ROLE_KEY: PUBLISHABLE });

  assert.equal(r.enabled, false);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAuthRedirect,
  needsRefresh,
  buildGoogleSignInUrl,
  isValidEmail,
  requestMagicLink,
  refreshSession,
  loadSession,
  saveSession,
  clearSession,
  SESSION_STORAGE_KEY,
} = require('../dist/lib/accounts/session.js');

const URL = 'https://abcdefghij.supabase.co';
const KEY = 'sb_publishable_' + 'P'.repeat(26) + 'abcd';
const USER = '11111111-1111-1111-1111-111111111111';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (over = {}) => `${b64({ alg: 'HS256' })}.${b64({ sub: USER, email: 'reader@example.com', ...over })}.sig`;
const NOW = 1_800_000_000;

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
};
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

// ---- coming back from the sign-in page ---------------------------------------------------------------------------------

test('Redirect - a good sign-in comes back as a session with the expiry worked out', () => {
  const t = token();
  const r = parseAuthRedirect(`#access_token=${t}&refresh_token=refresh123&expires_in=3600&token_type=bearer&type=magiclink`, NOW);

  assert.equal(r.ok, true);
  assert.deepEqual(r.session, { accessToken: t, refreshToken: 'refresh123', expiresAt: NOW + 3600, userId: USER, email: 'reader@example.com' });
});

test('Redirect - a page with nothing to do with sign-in is left alone', () => {
  for (const hash of ['', '#', '#section-2', '#foo=bar']) assert.equal(parseAuthRedirect(hash, NOW), null);
});

test('Redirect - a refused or expired link gives a kind message, never the raw error', () => {
  const r = parseAuthRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', NOW);

  assert.equal(r.ok, false);
  assert.match(r.message, /expired|invalid|new link/i);
});

test('Redirect - a token that is not a real token is refused', () => {
  const bad = [
    '#access_token=abc&refresh_token=r&expires_in=3600',
    `#access_token=${token()}&expires_in=3600`,
    `#access_token=${token({ sub: 'x' })}&refresh_token=r&expires_in=3600`,
    `#access_token=${token()}&refresh_token=r&expires_in=banana`,
  ];
  for (const hash of bad) {
    const r = parseAuthRedirect(hash, NOW);
    assert.equal(r?.ok, false, hash.slice(0, 30));
  }
});

// ---- expiry ------------------------------------------------------------------------------------------------------------

test('Expiry - a session is renewed a little before it runs out', () => {
  const s = { expiresAt: NOW + 3600 };
  assert.equal(needsRefresh(s, NOW), false);
  assert.equal(needsRefresh(s, NOW + 3600 - 30), true);
  assert.equal(needsRefresh(s, NOW + 4000), true);
});

// ---- starting sign-in --------------------------------------------------------------------------------------------------

test('Google - the sign-in link goes to this project and comes back to this site only', () => {
  const link = buildGoogleSignInUrl(URL, 'https://rabbittrail.vercel.app/account');
  const u = new globalThis.URL(link);

  assert.equal(u.origin, URL);
  assert.equal(u.pathname, '/auth/v1/authorize');
  assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('redirect_to'), 'https://rabbittrail.vercel.app/account');
});

test('Email - only something that looks like an address is sent', () => {
  for (const ok of ['a@b.co', 'reader+rabbit@example.com', ' reader@example.com ']) assert.equal(isValidEmail(ok), true, ok);
  for (const bad of ['', 'nope', 'a@b', '@b.co', 'a b@c.com', 'a@b@c.com', 'x'.repeat(300) + '@b.co']) assert.equal(isValidEmail(bad), false, bad.slice(0, 20));
});

test('Magic link - asks Supabase to email a link that returns to this site, using only the public key', async () => {
  const calls = [];
  const out = await requestMagicLink({
    url: URL,
    publishableKey: KEY,
    email: ' Reader@Example.com ',
    redirectTo: 'https://rabbittrail.vercel.app/account',
    fetchImpl: async (u, init) => {
      calls.push({ u, init });
      return res(200, {});
    },
  });

  assert.deepEqual(out, { ok: true });
  assert.ok(calls[0].u.startsWith(`${URL}/auth/v1/otp`));
  assert.ok(calls[0].u.includes('redirect_to=' + encodeURIComponent('https://rabbittrail.vercel.app/account')));
  assert.equal(calls[0].init.headers.apikey, KEY);
  assert.equal(JSON.parse(calls[0].init.body).email, 'reader@example.com');
  assert.equal(JSON.parse(calls[0].init.body).create_user, true);
});

test('Magic link - says what went wrong in plain words', async () => {
  const send = (status, body, email = 'reader@example.com') =>
    requestMagicLink({ url: URL, publishableKey: KEY, email, redirectTo: 'https://x.y/a', fetchImpl: async () => res(status, body) });

  assert.match((await send(200, {}, 'nope')).message, /email/i);
  assert.match((await send(429, { msg: 'email rate limit exceeded' })).message, /wait|too many|minute/i);
  assert.match((await send(500, {})).message, /try again/i);
  const offline = await requestMagicLink({
    url: URL,
    publishableKey: KEY,
    email: 'a@b.co',
    redirectTo: 'https://x.y/a',
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(offline.ok, false);
  assert.match(offline.message, /connection|try again/i);
});

// ---- keeping the session -----------------------------------------------------------------------------------------------

test('Refresh - a valid refresh token gives a new session, and a rejected one says the reader must sign in again', async () => {
  const t = token();
  const good = await refreshSession({
    url: URL,
    publishableKey: KEY,
    refreshToken: 'r1',
    now: NOW,
    fetchImpl: async () => res(200, { access_token: t, refresh_token: 'r2', expires_in: 3600 }),
  });
  assert.equal(good.ok, true);
  assert.equal(good.session.refreshToken, 'r2');
  assert.equal(good.session.expiresAt, NOW + 3600);

  const bad = await refreshSession({ url: URL, publishableKey: KEY, refreshToken: 'r1', now: NOW, fetchImpl: async () => res(400, { error: 'invalid_grant' }) });
  assert.deepEqual(bad, { ok: false, signedOut: true });

  const down = await refreshSession({ url: URL, publishableKey: KEY, refreshToken: 'r1', now: NOW, fetchImpl: async () => res(503, {}) });
  assert.deepEqual(down, { ok: false, signedOut: false }, 'an outage does not sign anyone out');
});

test('Storage - a session survives a reload, and damaged or foreign data is ignored', () => {
  const storage = memory();
  const session = { accessToken: token(), refreshToken: 'r', expiresAt: NOW + 10, userId: USER, email: 'reader@example.com' };

  saveSession(storage, session);
  assert.deepEqual(loadSession(storage), session);

  storage.setItem(SESSION_STORAGE_KEY, '{not json');
  assert.equal(loadSession(storage), null);
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 5 }));
  assert.equal(loadSession(storage), null);
  assert.equal(loadSession(null), null);

  saveSession(storage, session);
  clearSession(storage);
  assert.equal(loadSession(storage), null);
});

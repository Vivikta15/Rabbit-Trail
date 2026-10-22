const test = require('node:test');
const assert = require('node:assert/strict');

const { chooseBackend, validateSupabaseUrl, validateServiceKey, describeServiceKey } = require('../dist/lib/config/backend.js');

// Built so no key-looking literal appears in the repo.
const secretKey = (tail = 'S'.repeat(30)) => 'sb_secret_' + tail;
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.${'X'.repeat(30)}`;
const URL_ = 'https://abcdefghij.supabase.co';

// ---- URL -----------------------------------------------------------------------------------------

test('Supabase URL - accepts a project URL and normalizes it', () => {
  assert.deepEqual(validateSupabaseUrl(URL_), { ok: true, url: URL_ });
  assert.deepEqual(validateSupabaseUrl(`  ${URL_}/  `), { ok: true, url: URL_ });
  assert.deepEqual(validateSupabaseUrl('http://127.0.0.1:54321'), { ok: true, url: 'http://127.0.0.1:54321' }, 'the local Supabase CLI');
});

test('Supabase URL - rejects the common mistakes with what to do', () => {
  const cases = {
    missing: [undefined, /not set/i],
    notUrl: ['abcdefghij.supabase.co', /https:\/\//],
    plainHttp: ['http://abcdefghij.supabase.co', /https/i],
    withPath: [`${URL_}/rest/v1`, /just the project url/i],
    dashboard: ['https://supabase.com/dashboard/project/abcdefghij', /project url|dashboard/i],
  };
  for (const [name, [value, pattern]] of Object.entries(cases)) {
    const r = validateSupabaseUrl(value);
    assert.equal(r.ok, false, name);
    assert.match(r.problem, pattern, name);
  }
});

// ---- service key ---------------------------------------------------------------------------------

test('Service key - accepts the new secret key and the legacy service_role key', () => {
  assert.equal(validateServiceKey(secretKey()).ok, true);
  assert.equal(validateServiceKey(`"${secretKey()}"`).ok, true);
  assert.equal(validateServiceKey(jwt('service_role')).ok, true);
});

test('Service key - refuses the PUBLIC keys, because the server needs the secret one', () => {
  const publishable = validateServiceKey('sb_publishable_' + 'P'.repeat(30));
  const anon = validateServiceKey(jwt('anon'));

  assert.equal(publishable.ok, false);
  assert.match(publishable.problem, /public|publishable/i);
  assert.equal(anon.ok, false);
  assert.match(anon.problem, /public|anon/i);
  assert.match(anon.problem, /service_role|secret/i);
});

test('Service key - rejects missing, malformed and truncated keys without echoing them', () => {
  for (const bad of [undefined, '', '   ', 'hello', 'sb_secret_short', 'eyJnotreallyajwt', 'sb_secret_' + 'x'.repeat(30) + ' extra']) {
    const r = validateServiceKey(bad);
    assert.equal(r.ok, false, String(bad));
    assert.equal(typeof r.problem, 'string');
  }
  const leaked = validateServiceKey('sb_secret_' + 'Z'.repeat(8));
  assert.equal(leaked.ok, false);
  assert.equal(leaked.problem.includes('ZZZZ'), false);
});

test('Service key - describing it shows only the last four characters', () => {
  const shown = describeServiceKey(secretKey('A'.repeat(26) + 'wxyz'));

  assert.match(shown, /wxyz$/);
  assert.equal(shown.includes('AAAAA'), false);
});

// ---- choosing the backend ------------------------------------------------------------------------

test('Backend - neither Supabase setting means local files in the default or chosen folder', () => {
  const dflt = chooseBackend({}, '/work');
  assert.equal(dflt.kind, 'file');
  assert.match(dflt.dir.replace(/\\/g, '/'), /\/work\/content\/stories$/);

  assert.deepEqual(chooseBackend({ STORIES_DIR: '/elsewhere' }, '/work'), { kind: 'file', dir: '/elsewhere' });
});

test('Backend - both settings, valid, means Supabase', () => {
  const result = chooseBackend({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: secretKey() }, '/work');

  assert.deepEqual(result, { kind: 'supabase', url: URL_, serviceKey: secretKey() });
});

test('Backend - only one of the two settings is an error, never a silent fallback to files', () => {
  const onlyUrl = chooseBackend({ SUPABASE_URL: URL_ }, '/work');
  const onlyKey = chooseBackend({ SUPABASE_SERVICE_ROLE_KEY: secretKey() }, '/work');

  for (const r of [onlyUrl, onlyKey]) {
    assert.equal(r.kind, 'error');
    assert.match(r.problems.join(' '), /both|neither/i);
  }
});

test('Backend - both set but wrong reports every problem at once, without echoing the key', () => {
  const result = chooseBackend({ SUPABASE_URL: 'http://x.supabase.co/rest/v1', SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_' + 'Q'.repeat(30) }, '/work');

  assert.equal(result.kind, 'error');
  assert.equal(result.problems.length, 2);
  assert.equal(JSON.stringify(result).includes('QQQQQQ'), false);
});

test('Backend - a Vercel deployment without Supabase refuses to run on local files', () => {
  const result = chooseBackend({ VERCEL: '1' }, '/var/task');

  assert.equal(result.kind, 'error');
  assert.match(result.problems.join(' '), /SUPABASE_URL/);
  assert.match(result.problems.join(' '), /Vercel/);
});

test('Backend - a deployment can also demand Supabase explicitly', () => {
  assert.equal(chooseBackend({ REQUIRE_SUPABASE: '1' }, '/work').kind, 'error');
  assert.equal(chooseBackend({ REQUIRE_SUPABASE: '1', SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: secretKey() }, '/work').kind, 'supabase');
});

test('Backend - blank values count as not set', () => {
  assert.equal(chooseBackend({ SUPABASE_URL: '  ', SUPABASE_SERVICE_ROLE_KEY: '' }, '/work').kind, 'file');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runDoctor, formatReport, hasFailures } = require('../dist/lib/doctor/checks.js');
const { saveKeyToEnvFile, isIgnoredByGit } = require('../dist/lib/config/env-file.js');
const { DatabaseSchemaError } = require('../dist/lib/db/supabase-rest.js');

// Built by concatenation so no key-looking literal sits in the repo.
const fakeKey = () => 'sk-ant-' + 'api03-' + 'K'.repeat(40);
const sbKey = () => 'sb_secret_' + 'T'.repeat(26) + 'wxyz';
const SB_URL = 'https://abcdefghij.supabase.co';

const fakeRepo = (over = {}) => ({
  kind: 'supabase',
  describe: () => 'Supabase (abcdefghij.supabase.co)',
  verify: async () => 'connected; the 4 tables and the lock functions are in place',
  list: async () => ({ valid: [{ id: 'a' }, { id: 'b' }], problems: [] }),
  ...over,
});

// A world where everything is fine, on Supabase; each test breaks one thing.
function deps(over = {}) {
  return {
    nodeVersion: '24.1.0',
    env: { ANTHROPIC_API_KEY: fakeKey(), SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: sbKey() },
    cwd: '/work',
    envFileExists: true,
    pingWikipedia: async () => {},
    pingLlm: async () => {},
    openRepository: () => fakeRepo(),
    fileHousekeeping: () => ({ lock: 'none', staleTemps: [] }),
    ...over,
  };
}

const byName = (results, name) => results.find((r) => r.name === name);

test('Doctor - a healthy Supabase setup passes every check', async () => {
  const results = await runDoctor(deps());

  assert.equal(hasFailures(results), false);
  assert.ok(results.every((r) => r.status === 'pass'), JSON.stringify(results.filter((r) => r.status !== 'pass')));
  assert.ok(results.length >= 9);
});

test('Doctor - never prints either key, only the last four characters of each', async () => {
  const text = formatReport(await runDoctor(deps()));

  assert.equal(text.includes(fakeKey()), false);
  assert.equal(text.includes(sbKey()), false);
  assert.equal(text.includes('KKKKKKKK'), false);
  assert.equal(text.includes('TTTTTTTT'), false);
  assert.match(text, /KKKK/);
  assert.match(text, /wxyz/);
});

// ---- the AI provider ---------------------------------------------------------------------------------------------

const gemKey = () => 'AIza' + 'Sy' + 'G'.repeat(29) + 'wxyz';
const geminiEnv = (over = {}) => ({ GEMINI_API_KEY: gemKey(), SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: sbKey(), ...over });

test('Doctor - a Gemini setup passes, names the provider and model, and shows only the last four key characters', async () => {
  const pinged = [];
  const results = await runDoctor(deps({ env: geminiEnv(), pingLlm: async (config) => { pinged.push(config); } }));

  assert.equal(hasFailures(results), false);
  assert.match(byName(results, 'AI key').detail, /Gemini/);
  assert.match(byName(results, 'AI model').detail, /gemini-3\.8-flash/);
  assert.equal(pinged[0].provider, 'gemini');
  assert.equal(pinged[0].apiKey, gemKey());
  const text = formatReport(results);
  assert.equal(text.includes(gemKey()), false);
  assert.equal(text.includes('GGGGGGGG'), false);
  assert.match(text, /wxyz/);
});

test('Doctor - a Gemini failure (quota, model, key) is reported with Google\'s explanation, key redacted', async () => {
  const results = await runDoctor(deps({ env: geminiEnv(), pingLlm: async () => { throw new Error(`Gemini says the rate or daily quota is used up (429). key=${gemKey()}`); } }));
  const r = byName(results, 'AI connection');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /429/);
  assert.equal(JSON.stringify(results).includes(gemKey()), false);
});

test('Doctor - two AI keys with no LLM_PROVIDER is a failure that says how to choose', async () => {
  const results = await runDoctor(deps({ env: geminiEnv({ ANTHROPIC_API_KEY: fakeKey() }) }));

  assert.equal(byName(results, 'AI key').status, 'fail');
  assert.match(byName(results, 'AI key').detail, /LLM_PROVIDER/);
  assert.equal(byName(results, 'AI connection').status, 'skip');

  const chosen = await runDoctor(deps({ env: geminiEnv({ ANTHROPIC_API_KEY: fakeKey(), LLM_PROVIDER: 'gemini' }) }));
  assert.equal(hasFailures(chosen), false);
});

test('Doctor - no AI key at all names both ways to set one up', async () => {
  const r = byName(await runDoctor(deps({ env: { SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: sbKey() } })), 'AI key');

  assert.equal(r.status, 'fail');
  assert.match(r.fix, /setup:gemini/);
  assert.match(r.fix, /setup:key/);
});

test('Doctor - an old Node fails with what to install', async () => {
  const r = byName(await runDoctor(deps({ nodeVersion: '18.19.0' })), 'Node version');

  assert.equal(r.status, 'fail');
  assert.match(r.fix, /Node 22/);
});

test('Doctor - a missing Anthropic key fails with the setup command, and the live check is skipped, not run', async () => {
  let pinged = false;
  const results = await runDoctor(deps({ env: { SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: sbKey() }, envFileExists: false, pingLlm: async () => { pinged = true; } }));

  assert.equal(byName(results, 'AI key').status, 'fail');
  assert.match(byName(results, 'AI key').fix, /setup:key/);
  assert.equal(byName(results, 'AI connection').status, 'skip');
  assert.equal(pinged, false, 'no network call with a key that is known to be bad');
});

test('Doctor - a malformed Anthropic key is explained without echoing it', async () => {
  const results = await runDoctor(deps({ env: { ANTHROPIC_API_KEY: 'sk-ant-' + 'tooshort', SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: sbKey() } }));

  assert.match(byName(results, 'AI key').detail, /incomplete|too short/i);
  assert.equal(JSON.stringify(results).includes('tooshort'), false);
});

test('Doctor - a rejected Anthropic key is reported with the service message', async () => {
  const results = await runDoctor(deps({ pingLlm: async () => { throw new Error('Anthropic rejected the API key (401). Run "npm run setup:key" to enter a working key.'); } }));

  assert.equal(byName(results, 'AI connection').status, 'fail');
  assert.match(byName(results, 'AI connection').detail, /401/);
  assert.equal(hasFailures(results), true);
});

test('Doctor - Wikipedia being unreachable fails with a retry hint', async () => {
  const r = byName(await runDoctor(deps({ pingWikipedia: async () => { throw new Error('Wikipedia is not responding (503).'); } })), 'Wikipedia connection');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /503/);
});

// ---- storage -----------------------------------------------------------------------------------

test('Doctor - names the storage backend in use', async () => {
  const r = byName(await runDoctor(deps()), 'Story storage');

  assert.equal(r.status, 'pass');
  assert.match(r.detail, /Supabase/);
  assert.match(r.detail, /wxyz/);
});

test('Doctor - local files work for development but are flagged as not enough for the website', async () => {
  const results = await runDoctor(deps({ env: { ANTHROPIC_API_KEY: fakeKey() }, openRepository: () => fakeRepo({ kind: 'file', describe: () => 'local files in /work/content/stories' }) }));
  const r = byName(results, 'Story storage');

  assert.equal(r.status, 'warn');
  assert.match(r.detail, /local files/i);
  assert.match(r.fix, /SUPABASE_URL/);
  assert.equal(hasFailures(results), false, 'files are fine in development, so this must not fail');
});

test('Doctor - a half-set Supabase configuration fails, names what is missing, and the later checks are skipped', async () => {
  let opened = false;
  const results = await runDoctor(deps({ env: { ANTHROPIC_API_KEY: fakeKey(), SUPABASE_URL: SB_URL }, openRepository: () => { opened = true; return fakeRepo(); } }));

  assert.equal(byName(results, 'Story storage').status, 'fail');
  assert.match(byName(results, 'Story storage').detail, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(byName(results, 'Storage access').status, 'skip');
  assert.equal(byName(results, 'Stored stories').status, 'skip');
  assert.equal(opened, false);
});

test('Doctor - the public Supabase key is refused with the reason', async () => {
  const results = await runDoctor(deps({ env: { ANTHROPIC_API_KEY: fakeKey(), SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_' + 'P'.repeat(30) } }));
  const r = byName(results, 'Story storage');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /public/i);
  assert.equal(JSON.stringify(results).includes('PPPPPPPP'), false);
});

test('Doctor - a missing migration is reported with the file to run', async () => {
  const results = await runDoctor(deps({ openRepository: () => fakeRepo({ verify: async () => { throw new DatabaseSchemaError('Supabase does not have "stories". Open the Supabase SQL editor and run supabase/migrations/0001_stories.sql.'); } }) }));
  const r = byName(results, 'Storage access');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /0001_stories\.sql/);
  assert.equal(byName(results, 'Stored stories').status, 'skip', 'no point listing stories from a store that failed its access check');
});

test('Doctor - a rejected Supabase key is reported', async () => {
  const r = byName(await runDoctor(deps({ openRepository: () => fakeRepo({ verify: async () => { throw new Error('Supabase rejected the service key (401).'); } }) })), 'Storage access');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /401/);
});

test('Doctor - unusable stored stories are a warning naming each record and why', async () => {
  const r = byName(
    await runDoctor(deps({ openRepository: () => fakeRepo({ list: async () => ({ valid: [{ id: 'a' }], problems: [{ file: 'broken.json', reason: 'not valid JSON' }, { file: 'x', reason: 'facts must be a non-empty list' }] }) }) })),
    'Stored stories',
  );

  assert.equal(r.status, 'warn');
  assert.match(r.detail, /broken\.json/);
  assert.match(r.detail, /facts must be a non-empty list/);
});

test('Doctor - counts the built-in story plus stored ones', async () => {
  const r = byName(await runDoctor(deps({ openRepository: () => fakeRepo({ list: async () => ({ valid: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], problems: [] }) }) })), 'Stored stories');

  assert.equal(r.status, 'pass');
  assert.match(r.detail, /3 stored/);
});

test('Doctor - leftovers from a crashed local run are warnings with the fix', async () => {
  const results = await runDoctor(deps({ env: { ANTHROPIC_API_KEY: fakeKey() }, openRepository: () => fakeRepo({ kind: 'file' }), fileHousekeeping: () => ({ lock: 'stale', staleTemps: ['a.json.tmp'] }) }));

  assert.equal(byName(results, 'Run lock').status, 'warn');
  assert.equal(byName(results, 'Leftover temp files').status, 'warn');
  assert.equal(hasFailures(results), false, 'warnings must not fail the check');
});

test('Doctor - a local run in progress is reported as such', async () => {
  const r = byName(await runDoctor(deps({ env: { ANTHROPIC_API_KEY: fakeKey() }, openRepository: () => fakeRepo({ kind: 'file' }), fileHousekeeping: () => ({ lock: 'held', staleTemps: [] }) })), 'Run lock');

  assert.equal(r.status, 'warn');
  assert.match(r.detail, /in progress/i);
});

test('Doctor - on Supabase the lock and temp-file checks do not apply, and say so', async () => {
  const results = await runDoctor(deps());

  assert.equal(byName(results, 'Run lock').status, 'pass');
  assert.match(byName(results, 'Run lock').detail, /database/i);
  assert.equal(byName(results, 'Leftover temp files').status, 'pass');
});

test('Doctor - one failing check never stops the others from running', async () => {
  const results = await runDoctor(deps({ nodeVersion: '10.0.0', env: {}, pingWikipedia: async () => { throw new Error('down'); } }));

  assert.ok(results.length >= 9);
  assert.equal(results.filter((r) => r.status === 'fail').length >= 3, true);
});

test('Doctor - the report lists each check with a clear status and the fix underneath', async () => {
  const text = formatReport(await runDoctor(deps({ env: { SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: sbKey() }, envFileExists: false })));

  assert.match(text, /\[FAIL\] AI key/);
  assert.match(text, /\[ok\] Node version/);
  assert.match(text, /\[skip\] AI connection/);
  assert.match(text, /Fix: .*setup:gemini/);
  assert.match(text, /Fix: .*setup:key/);
});

// ---- saving the key ----------------------------------------------------------------------------

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-trail-env-')), '.env.local');

test('Save key - creates the file with just the key', () => {
  const file = tempFile();

  saveKeyToEnvFile(file, fakeKey());

  assert.equal(fs.readFileSync(file, 'utf-8'), `ANTHROPIC_API_KEY=${fakeKey()}\n`);
});

test('Save key - keeps the other settings and replaces an old key', () => {
  const file = tempFile();
  fs.writeFileSync(file, 'STORY_MODEL=claude-sonnet-5-5\nANTHROPIC_API_KEY=old\n');

  saveKeyToEnvFile(file, fakeKey());

  assert.equal(fs.readFileSync(file, 'utf-8'), `STORY_MODEL=claude-sonnet-5-5\nANTHROPIC_API_KEY=${fakeKey()}\n`);
});

test('Save key - leaves no temp file behind and refuses a key that is not valid', () => {
  const file = tempFile();

  saveKeyToEnvFile(file, fakeKey());
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['.env.local']);

  assert.throws(() => saveKeyToEnvFile(file, 'not-a-key'), /Anthropic key/);
  assert.equal(fs.readFileSync(file, 'utf-8').includes('not-a-key'), false, 'a bad key must never be written');
});

test('Save settings - writes several values at once and keeps everything else in the file', () => {
  const { saveEnvValues } = require('../dist/lib/config/env-file.js');
  const file = tempFile();
  fs.writeFileSync(file, `# mine\nANTHROPIC_API_KEY=${fakeKey()}\nSUPABASE_URL=https://old.supabase.co\n`);

  saveEnvValues(file, { SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: sbKey() });

  assert.equal(
    fs.readFileSync(file, 'utf-8'),
    `# mine\nANTHROPIC_API_KEY=${fakeKey()}\nSUPABASE_URL=${SB_URL}\nSUPABASE_SERVICE_ROLE_KEY=${sbKey()}\n`,
  );
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['.env.local'], 'no temp file left behind');
});

test('Save settings - refuses a name or value that could corrupt the file', () => {
  const { saveEnvValues } = require('../dist/lib/config/env-file.js');
  const file = tempFile();
  fs.writeFileSync(file, 'A=1\n');

  assert.throws(() => saveEnvValues(file, { 'BAD NAME': 'x' }), /name/i);
  assert.throws(() => saveEnvValues(file, { GOOD: 'line one\nINJECTED=1' }), /line break/i);
  assert.equal(fs.readFileSync(file, 'utf-8'), 'A=1\n', 'a refused write must leave the file untouched');
});

test('Git ignore - recognises the patterns that keep .env.local out of the repository', () => {
  assert.equal(isIgnoredByGit('node_modules/\n.env*.local\n', '.env.local'), true);
  assert.equal(isIgnoredByGit('.env.local\n', '.env.local'), true);
  assert.equal(isIgnoredByGit('.env*\n', '.env.local'), true);
  assert.equal(isIgnoredByGit('*.local\n', '.env.local'), true);
  assert.equal(isIgnoredByGit('# .env.local\nnode_modules/\n', '.env.local'), false, 'a comment does not ignore anything');
  assert.equal(isIgnoredByGit('', '.env.local'), false);
  assert.equal(isIgnoredByGit('.env.production\n', '.env.local'), false);
});

test('Git ignore - this repository really ignores .env.local', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf-8');

  assert.equal(isIgnoredByGit(text, '.env.local'), true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runDoctor, formatReport, hasFailures } = require('../dist/lib/doctor/checks.js');
const { saveKeyToEnvFile, isIgnoredByGit } = require('../dist/lib/config/env-file.js');

const fakeKey = () => 'sk-ant-' + 'api03-' + 'K'.repeat(40);

// A world where everything is fine; each test breaks one thing.
function deps(over = {}) {
  return {
    nodeVersion: '24.1.0',
    env: { ANTHROPIC_API_KEY: fakeKey() },
    cwd: '/work',
    envFileExists: true,
    pingWikipedia: async () => {},
    pingAnthropic: async () => {},
    inspectDir: () => ({ valid: [{ id: 'a' }, { id: 'b' }], problems: [] }),
    ensureWritable: () => {},
    lockState: () => 'none',
    staleTempFiles: () => [],
    ...over,
  };
}

const byName = (results, name) => results.find((r) => r.name === name);

test('Doctor - a healthy setup passes every check', async () => {
  const results = await runDoctor(deps());

  assert.equal(hasFailures(results), false);
  assert.ok(results.every((r) => r.status === 'pass'), JSON.stringify(results.filter((r) => r.status !== 'pass')));
  assert.ok(results.length >= 7);
});

test('Doctor - never prints the key, only its last four characters', async () => {
  const text = formatReport(await runDoctor(deps()));

  assert.equal(text.includes(fakeKey()), false);
  assert.equal(text.includes('KKKKKKKK'), false);
  assert.match(text, /KKKK/);
});

test('Doctor - an old Node fails with what to install', async () => {
  const r = byName(await runDoctor(deps({ nodeVersion: '18.19.0' })), 'Node version');

  assert.equal(r.status, 'fail');
  assert.match(r.fix, /Node 22/);
});

test('Doctor - a missing key fails with the setup command, and the live check is skipped, not run', async () => {
  let pinged = false;
  const results = await runDoctor(deps({ env: {}, envFileExists: false, pingAnthropic: async () => { pinged = true; } }));

  assert.equal(byName(results, 'API key').status, 'fail');
  assert.match(byName(results, 'API key').fix, /setup:key/);
  assert.equal(byName(results, 'Anthropic connection').status, 'skip');
  assert.equal(pinged, false, 'no network call with a key that is known to be bad');
});

test('Doctor - a malformed key is explained without echoing it', async () => {
  const results = await runDoctor(deps({ env: { ANTHROPIC_API_KEY: 'sk-ant-' + 'tooshort' } }));
  const key = byName(results, 'API key');

  assert.equal(key.status, 'fail');
  assert.match(key.detail, /incomplete|too short/i);
  assert.equal(JSON.stringify(results).includes('tooshort'), false);
});

test('Doctor - a rejected key or an unknown model is reported with the service message', async () => {
  const results = await runDoctor(deps({ pingAnthropic: async () => { throw new Error('Anthropic rejected the API key (401). Run "npm run setup:key" to enter a working key.'); } }));
  const r = byName(results, 'Anthropic connection');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /401/);
  assert.equal(hasFailures(results), true);
});

test('Doctor - Wikipedia being unreachable fails with a retry hint', async () => {
  const r = byName(await runDoctor(deps({ pingWikipedia: async () => { throw new Error('Wikipedia is not responding (503).'); } })), 'Wikipedia connection');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /503/);
});

test('Doctor - a folder that cannot be written to fails', async () => {
  const r = byName(await runDoctor(deps({ ensureWritable: () => { throw new Error('EACCES: permission denied'); } })), 'Stories folder');

  assert.equal(r.status, 'fail');
  assert.match(r.detail, /permission denied/);
});

test('Doctor - unusable story files are a warning naming each file and why', async () => {
  const r = byName(
    await runDoctor(deps({ inspectDir: () => ({ valid: [{ id: 'a' }], problems: [{ file: 'broken.json', reason: 'not valid JSON' }, { file: 'x.json', reason: 'facts must be a non-empty list' }] }) })),
    'Story files',
  );

  assert.equal(r.status, 'warn');
  assert.match(r.detail, /broken\.json/);
  assert.match(r.detail, /facts must be a non-empty list/);
});

test('Doctor - counts the built-in story plus generated ones', async () => {
  const r = byName(await runDoctor(deps({ inspectDir: () => ({ valid: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], problems: [] }) })), 'Story files');

  assert.equal(r.status, 'pass');
  assert.match(r.detail, /3 generated/);
});

test('Doctor - leftovers from a crashed run are warnings with the fix', async () => {
  const results = await runDoctor(deps({ lockState: () => 'stale', staleTempFiles: () => ['a.json.tmp'] }));

  assert.equal(byName(results, 'Run lock').status, 'warn');
  assert.equal(byName(results, 'Leftover temp files').status, 'warn');
  assert.equal(hasFailures(results), false, 'warnings must not fail the check');
});

test('Doctor - a lock held right now is reported as a run in progress', async () => {
  const r = byName(await runDoctor(deps({ lockState: () => 'held' })), 'Run lock');

  assert.equal(r.status, 'warn');
  assert.match(r.detail, /in progress/i);
});

test('Doctor - one failing check never stops the others from running', async () => {
  const results = await runDoctor(deps({ nodeVersion: '10.0.0', env: {}, pingWikipedia: async () => { throw new Error('down'); } }));

  assert.ok(results.length >= 7);
  assert.equal(results.filter((r) => r.status === 'fail').length >= 3, true);
});

test('Doctor - the report lists each check with a clear status and the fix underneath', async () => {
  const text = formatReport(await runDoctor(deps({ env: {}, envFileExists: false })));

  assert.match(text, /\[FAIL\] API key/);
  assert.match(text, /\[ok\] Node version/);
  assert.match(text, /\[skip\] Anthropic connection/);
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

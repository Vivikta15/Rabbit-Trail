const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFakePostgrest } = require('./helpers/fake-postgrest.js');
const { createFileRepository } = require('../dist/lib/stories/file-repository.js');
const { createSupabaseRepository } = require('../dist/lib/stories/supabase-repository.js');
const { importStories } = require('../dist/lib/stories/import.js');
const { PipelineAbort } = require('../dist/lib/pipeline/http.js');
const { VERIFIED_STORIES } = require('../dist/data/stories.js');

const KEY = 'sb_secret_' + 'S'.repeat(32);
const gen = (over = {}) => ({ ...structuredClone(VERIFIED_STORIES[0]), id: 'gen-one', date: '2026-10-20', ...over });
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-trail-import-'));

function pair() {
  const fake = createFakePostgrest({ serviceKey: KEY });
  const target = createSupabaseRepository({ url: 'https://abcdefghij.supabase.co', serviceKey: KEY, fetchImpl: fake.fetchImpl, retry: { retries: 0 } });
  return { fake, source: createFileRepository(tempDir()), target };
}

test('Import - copies every local story and rejected topic into the target', async () => {
  const { source, target } = pair();
  await source.save(gen({ id: 'one' }));
  await source.save(gen({ id: 'two', date: '2026-10-21' }));
  await source.recordRejection('Dull Page', 'no decision', '2026-10-20');

  const report = await importStories(source, target, '2026-10-22');

  assert.deepEqual(report, { imported: 2, alreadyThere: 0, rejectedCopied: 1, failed: [] });
  assert.deepEqual((await target.list()).valid.map((s) => s.id).sort(), ['one', 'two']);
  assert.ok((await target.loadRejected()).has('dull page'));
});

test('Import - running it twice is harmless: nothing is duplicated or overwritten', async () => {
  const { source, target } = pair();
  await source.save(gen({ id: 'one', title: 'Local title' }));
  await importStories(source, target, '2026-10-22');
  await source.recordRejection('Another', 'x', '2026-10-22');

  const again = await importStories(source, target, '2026-10-22');

  assert.deepEqual(again, { imported: 0, alreadyThere: 1, rejectedCopied: 1, failed: [] });
  assert.equal((await target.list()).valid.length, 1);
});

test('Import - a story already in the target is left exactly as it is', async () => {
  const { source, target } = pair();
  await target.save(gen({ id: 'one', title: 'Already in Supabase' }));
  await source.save(gen({ id: 'one', title: 'Local copy' }));

  const report = await importStories(source, target, '2026-10-22');

  assert.equal(report.alreadyThere, 1);
  assert.equal((await target.get('one')).title, 'Already in Supabase');
});

test('Import - damaged local files are skipped, and the rest still import', async () => {
  const { source, target } = pair();
  await source.save(gen({ id: 'good' }));
  fs.writeFileSync(path.join(source.dir, 'broken.json'), '{nope');

  const report = await importStories(source, target, '2026-10-22');

  assert.equal(report.imported, 1);
  assert.deepEqual((await target.list()).valid.map((s) => s.id), ['good']);
});

test('Import - an outage stops the import instead of reporting every story as failed', async () => {
  const fake = createFakePostgrest({ serviceKey: KEY, failFirst: [503, 503] });
  const target = createSupabaseRepository({ url: 'https://abcdefghij.supabase.co', serviceKey: KEY, fetchImpl: fake.fetchImpl, retry: { retries: 0 } });
  const source = createFileRepository(tempDir());
  await source.save(gen({ id: 'one' }));
  await source.save(gen({ id: 'two' }));

  await assert.rejects(() => importStories(source, target, '2026-10-22'), (e) => e instanceof PipelineAbort);
});

test('Import - a story the target refuses is reported by id, not hidden', async () => {
  const { source, target } = pair();
  await source.save(gen({ id: 'fine' }));
  const refusing = { ...target, save: async (s) => { if (s.id === 'fine') throw new Error('refused for a test'); } };

  const report = await importStories(source, refusing, '2026-10-22');

  assert.deepEqual(report.failed, [{ id: 'fine', reason: 'refused for a test' }]);
});

// Copies stories from local files into Supabase. Run with `npm run db:import` (optionally `-- --from <folder>`).
// Safe to run again: nothing that is already in Supabase is changed.
import path from 'node:path';
import { chooseBackend } from '../lib/config/backend';
import { localDateString } from '../lib/habit/activity-log';
import { createFileRepository } from '../lib/stories/file-repository';
import { createRepository } from '../lib/stories/get-repository';
import { importStories } from '../lib/stories/import';

async function main(): Promise<number> {
  const cwd = process.cwd();
  const backend = chooseBackend(process.env, cwd);

  if (backend.kind === 'error') {
    console.error('Cannot start:');
    backend.problems.forEach((p) => console.error(`  - ${p}`));
    return 1;
  }
  if (backend.kind !== 'supabase') {
    console.error('Cannot start: Supabase is not configured, so there is nowhere to import to.');
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see DEPLOY.md), then run this again.');
    return 1;
  }

  const fromIndex = process.argv.indexOf('--from');
  const from = path.resolve(cwd, fromIndex === -1 ? path.join('content', 'stories') : process.argv[fromIndex + 1] ?? '');
  const source = createFileRepository(from);
  const target = createRepository(backend);

  await target.verify();
  console.log(`Copying from ${source.describe()} to ${target.describe()}`);

  const report = await importStories(source, target, localDateString());
  console.log(`Imported ${report.imported} stories; ${report.alreadyThere} were already there; ${report.rejectedCopied} rejected topics copied.`);
  if (report.failed.length > 0) {
    console.error(`${report.failed.length} could not be imported:`);
    report.failed.forEach((f) => console.error(`  - ${f.id}: ${f.reason}`));
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Import failed: ${(err as Error).message}`);
    process.exit(1);
  },
);

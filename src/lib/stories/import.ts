import { PipelineAbort } from '../pipeline/http';
import { StoryExistsError, StoryRepository } from './repository';

export interface ImportReport {
  imported: number;
  alreadyThere: number;
  rejectedCopied: number;
  failed: { id: string; reason: string }[];
}

// Copies stories and rejected topics from one store to another (for example local files to Supabase). Nothing in
// the target is ever overwritten, so it is safe to run again. An outage stops the whole import: reporting every
// remaining story as "failed" would only hide that the service was down.
export async function importStories(source: StoryRepository, target: StoryRepository, today: string): Promise<ImportReport> {
  const report: ImportReport = { imported: 0, alreadyThere: 0, rejectedCopied: 0, failed: [] };

  for (const story of (await source.list()).valid) {
    try {
      await target.save(story);
      report.imported += 1;
    } catch (err) {
      if (err instanceof StoryExistsError) report.alreadyThere += 1;
      else if (err instanceof PipelineAbort) throw err;
      else report.failed.push({ id: story.id, reason: (err as Error).message });
    }
  }

  for (const title of await source.loadRejected()) {
    await target.recordRejection(title, 'copied from another store', today);
    report.rejectedCopied += 1;
  }
  return report;
}

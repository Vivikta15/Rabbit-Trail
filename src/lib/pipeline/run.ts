import { Story } from '../../types';
import { loadCatalog } from '../stories/catalog';
import { parseGeneratedStory, buildGenerationPrompt } from './generate';
import { PipelineAbort } from './http';
import { LlmClient } from './llm-client';
import { acquireLock } from './lock';
import { cleanStaleTemps, loadRejected, publishStory, recordRejection } from './publish';
import { chooseFrontierTopic } from './topics';
import { verifyStory } from './verify';
import { WikiPage } from './wikipedia';

export interface WikiSource {
  fetchPage(title: string): Promise<WikiPage | null>;
}

export type RunResult =
  | { status: 'published'; id: string; title: string; path: string }
  | { status: 'no-topic' }
  | { status: 'failed'; reasons: string[] }
  // The run was stopped on purpose (bad key, outage, spent budget). Nothing was blamed on any topic.
  | { status: 'aborted'; reason: string };

interface RunOptions {
  dir: string;
  today: string;
  wiki: WikiSource;
  llm: LlmClient;
  maxAttempts: number;
  maxModelCalls?: number;
}

const norm = (title: string) => title.trim().toLowerCase();

// Counts every model call and refuses the one after the limit, so a bad day cannot run up a bill.
function withBudget(llm: LlmClient, maxModelCalls: number | undefined): LlmClient {
  let used = 0;
  return {
    usage: llm.usage?.bind(llm),
    async complete(system, user) {
      if (maxModelCalls !== undefined && used >= maxModelCalls) {
        throw new PipelineAbort(`Stopped: the budget of ${maxModelCalls} model calls for this run is spent.`);
      }
      used += 1;
      return llm.complete(system, user);
    },
  };
}

// Produces at most one new verified story: follows the catalog's links to the best uncovered topic, has the
// model write it from the page, and publishes only if the verification gate passes. Only one run may write to
// the folder at a time; the lock is always released, however the run ends.
export async function generateNextStory(options: RunOptions): Promise<RunResult> {
  let lock;
  try {
    lock = acquireLock(options.dir);
  } catch (err) {
    if (err instanceof PipelineAbort) return { status: 'aborted', reason: err.message };
    throw err;
  }
  try {
    cleanStaleTemps(options.dir);
    return await runLocked(options);
  } finally {
    lock.release();
  }
}

async function runLocked({ dir, today, wiki, llm: rawLlm, maxAttempts, maxModelCalls }: RunOptions): Promise<RunResult> {
  const llm = withBudget(rawLlm, maxModelCalls);
  const catalog = loadCatalog(dir);
  const rejected = loadRejected(dir);
  const triedThisRun = new Set<string>();
  const reasons: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const topic = chooseFrontierTopic(catalog, new Set([...rejected, ...triedThisRun]));
    if (!topic) return reasons.length > 0 ? { status: 'failed', reasons } : { status: 'no-topic' };
    triedThisRun.add(norm(topic));

    // Permanent skips are written down so a later run does not pay for the same dead end again.
    const reject = (reason: string) => {
      recordRejection(dir, topic, reason, today);
      rejected.add(norm(topic));
      reasons.push(`${topic}: ${reason}`);
    };

    try {
      const page = await wiki.fetchPage(topic);
      if (!page) {
        reject('page not found or is a disambiguation page');
        continue;
      }
      if (catalog.some((s) => norm(s.source.title) === norm(page.title))) {
        reject(`redirects to "${page.title}", which already has a story`);
        continue;
      }

      const { system, user } = buildGenerationPrompt(page);
      const parsed = parseGeneratedStory(await llm.complete(system, user), page, today);
      if (!parsed.ok) {
        if (parsed.declined) reject(`the model declined: ${parsed.reason}`);
        else reasons.push(`${topic}: ${parsed.reason}`); // a bad answer is not the page's fault, so it is retried on a later run
        continue;
      }

      const verification = await verifyStory(parsed.story, page, llm);
      if (!verification.ok) {
        reasons.push(...verification.failures.map((f) => `${topic}: ${f}`));
        continue;
      }

      const verified: Story = { ...parsed.story, facts: parsed.story.facts.map((f) => ({ ...f, isVerified: true })) };
      const file = publishStory(verified, dir);
      // A link like "Battle of Lepanto (1571)" can resolve to "Battle of Lepanto"; remember the alias so the
      // next run does not ask for the same page again.
      if (norm(topic) !== norm(page.title)) recordRejection(dir, topic, `redirects to "${page.title}" (published)`, today);
      return { status: 'published', id: verified.id, title: verified.title, path: file };
    } catch (err) {
      // Anything that makes continuing pointless stops the run without blaming the topic. Anything else
      // (a cut-off answer, a file that is in the way) only costs this topic.
      if (err instanceof PipelineAbort) return { status: 'aborted', reason: err.message };
      reasons.push(`${topic}: ${(err as Error).message}`);
    }
  }

  return { status: 'failed', reasons };
}

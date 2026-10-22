import { Story } from '../../types';
import { getCatalog } from '../stories/catalog';
import { StoryRepository } from '../stories/repository';
import { parseGeneratedStory, buildGenerationPrompt } from './generate';
import { PipelineAbort } from './http';
import { LlmClient } from './llm-client';
import { chooseFrontierTopic } from './topics';
import { verifyStory } from './verify';
import { WikiPage } from './wikipedia';

export interface WikiSource {
  fetchPage(title: string): Promise<WikiPage | null>;
}

export type RunResult =
  | { status: 'published'; id: string; title: string }
  | { status: 'no-topic' }
  | { status: 'failed'; reasons: string[] }
  // The run was stopped on purpose (bad key, outage, spent budget). Nothing was blamed on any topic.
  | { status: 'aborted'; reason: string };

interface RunOptions {
  repo: StoryRepository;
  today: string;
  wiki: WikiSource;
  llm: LlmClient;
  maxAttempts: number;
  maxModelCalls?: number;
  // Called with a line of progress as the run goes (which topic is being tried, and why one was skipped).
  log?: (message: string) => void;
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
// the store at a time; the lock is always released, however the run ends.
export async function generateNextStory(options: RunOptions): Promise<RunResult> {
  const { repo } = options;
  let lock;
  try {
    lock = await repo.acquireLock();
  } catch (err) {
    if (err instanceof PipelineAbort) return { status: 'aborted', reason: err.message };
    throw err;
  }

  const startedAt = new Date().toISOString();
  try {
    await repo.housekeeping();
    const result = await runLocked(options);

    // The log is for people; a failure to write it must never turn a good run into a failed one.
    try {
      await repo.recordRun({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: result.status,
        publishedId: result.status === 'published' ? result.id : null,
        details: {
          ...(result.status === 'failed' ? { reasons: result.reasons } : {}),
          ...(result.status === 'aborted' ? { reason: result.reason } : {}),
          ...(options.llm.usage ? { usage: options.llm.usage() } : {}),
        },
      });
    } catch {
      // ignored on purpose
    }
    return result;
  } finally {
    await lock.release();
  }
}

async function runLocked({ repo, today, wiki, llm: rawLlm, maxAttempts, maxModelCalls, log }: RunOptions): Promise<RunResult> {
  const llm = withBudget(rawLlm, maxModelCalls);
  const catalog = await getCatalog(repo);
  const rejected = await repo.loadRejected();
  const triedThisRun = new Set<string>();
  const reasons: string[] = [];
  const addReason = (reason: string) => {
    reasons.push(reason);
    log?.(`  - ${reason}`);
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const topic = chooseFrontierTopic(catalog, new Set([...rejected, ...triedThisRun]));
    if (!topic) return reasons.length > 0 ? { status: 'failed', reasons } : { status: 'no-topic' };
    triedThisRun.add(norm(topic));
    log?.(`Trying: ${topic}`);

    // Permanent skips are written down so a later run does not pay for the same dead end again.
    const reject = async (reason: string) => {
      await repo.recordRejection(topic, reason, today);
      rejected.add(norm(topic));
      addReason(`${topic}: ${reason}`);
    };

    try {
      const page = await wiki.fetchPage(topic);
      if (!page) {
        await reject('page not found or is a disambiguation page');
        continue;
      }
      if (catalog.some((s) => norm(s.source.title) === norm(page.title))) {
        await reject(`redirects to "${page.title}", which already has a story`);
        continue;
      }

      const { system, user } = buildGenerationPrompt(page);
      const parsed = parseGeneratedStory(await llm.complete(system, user), page, today);
      if (!parsed.ok) {
        if (parsed.declined) await reject(`the model declined: ${parsed.reason}`);
        else addReason(`${topic}: ${parsed.reason}`); // a bad answer is not the page's fault, so it is retried on a later run
        continue;
      }

      const verification = await verifyStory(parsed.story, page, llm);
      if (!verification.ok) {
        verification.failures.forEach((f) => addReason(`${topic}: ${f}`));
        continue;
      }

      const verified: Story = { ...parsed.story, facts: parsed.story.facts.map((f) => ({ ...f, isVerified: true })) };
      await repo.save(verified);
      // A link like "Battle of Lepanto (1571)" can resolve to "Battle of Lepanto"; remember the alias so the
      // next run does not ask for the same page again.
      if (norm(topic) !== norm(page.title)) await repo.recordRejection(topic, `redirects to "${page.title}" (published)`, today);
      return { status: 'published', id: verified.id, title: verified.title };
    } catch (err) {
      // Anything that makes continuing pointless stops the run without blaming the topic. Anything else
      // (a cut-off answer, a story id already taken) only costs this topic.
      if (err instanceof PipelineAbort) return { status: 'aborted', reason: err.message };
      addReason(`${topic}: ${(err as Error).message}`);
    }
  }

  return { status: 'failed', reasons };
}

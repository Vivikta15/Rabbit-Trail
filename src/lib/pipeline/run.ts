import { Story } from '../../types';
import { loadCatalog } from '../stories/catalog';
import { parseGeneratedStory, buildGenerationPrompt } from './generate';
import { LlmClient } from './llm-client';
import { loadRejected, publishStory, recordRejection } from './publish';
import { chooseFrontierTopic } from './topics';
import { verifyStory } from './verify';
import { WikiPage } from './wikipedia';

export interface WikiSource {
  fetchPage(title: string): Promise<WikiPage | null>;
}

export type RunResult =
  | { status: 'published'; id: string; title: string; path: string }
  | { status: 'no-topic' }
  | { status: 'failed'; reasons: string[] };

interface RunOptions {
  dir: string;
  today: string;
  wiki: WikiSource;
  llm: LlmClient;
  maxAttempts: number;
}

const norm = (title: string) => title.trim().toLowerCase();

// Produces at most one new verified story: follows the catalog's links to the best uncovered topic, has the
// model write it from the page, and publishes only if the verification gate passes.
export async function generateNextStory({ dir, today, wiki, llm, maxAttempts }: RunOptions): Promise<RunResult> {
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
  }

  return { status: 'failed', reasons };
}

// Generates new verified stories into the configured store. Run with `npm run stories:generate`.
import { chooseBackend } from '../lib/config/backend';
import { loadLlmConfig, PROVIDER_LABEL } from '../lib/config/provider';
import { localDateString } from '../lib/habit/activity-log';
import { needsStoryToday } from '../lib/pipeline/daily';
import { createStoryClients } from '../lib/pipeline/llm-factory';
import { generateNextStory } from '../lib/pipeline/run';
import { fetchPage } from '../lib/pipeline/wikipedia';
import { getCatalog } from '../lib/stories/catalog';
import { createRepository } from '../lib/stories/get-repository';

const MAX_COUNT = 10;
const MAX_ATTEMPTS_PER_STORY = 5;
// Each attempt costs about two model calls (write, then judge). This caps a bad run well below a surprise bill.
const MAX_MODEL_CALLS_PER_STORY = 12;

function parseCount(args: string[]): number {
  const i = args.indexOf('--count');
  const n = i === -1 ? 1 : Number(args[i + 1]);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_COUNT) : 1;
}

async function main(): Promise<number> {
  const cwd = process.cwd();
  const config = loadLlmConfig(process.env);
  const backend = chooseBackend(process.env, cwd);

  const problems = [...(config.ok ? [] : config.problems), ...(backend.kind === 'error' ? backend.problems : [])];
  if (!config.ok || backend.kind === 'error' || problems.length > 0) {
    console.error('Cannot start:');
    problems.forEach((p) => console.error(`  - ${p}`));
    console.error('Run "npm run doctor" to see the whole setup.');
    return 1;
  }

  const { provider, model } = config.config;
  const repo = createRepository(backend);
  // A separate checking model, when configured, so the writer never grades its own work. Either can have fallbacks.
  const { llm, judge } = createStoryClients(config.config, {}, (line) => console.log(line));

  // Fail before spending anything if the store is not ready (missing tables, bad key, unwritable folder).
  try {
    await repo.verify();
  } catch (err) {
    console.error(`Cannot start: ${(err as Error).message}`);
    return 1;
  }

  // A scheduled run only acts when today has no story yet, so it can be scheduled more than once a day.
  if (process.argv.includes('--if-missing-today')) {
    const today = localDateString();
    if (!needsStoryToday(await getCatalog(repo), today)) {
      console.log(`Today (${today}) already has its story. Nothing to do.`);
      return 0;
    }
  }

  const count = parseCount(process.argv.slice(2));
  let published = 0;
  let problem = false; // an outage or a run that could not produce a story, as opposed to "nothing left to do"
  console.log(`Writing to ${repo.describe()} using ${PROVIDER_LABEL[provider]}, model ${[model, ...(config.config.fallbackModels ?? [])].join(' -> ')}${judge ? `, checked by ${[config.config.judgeModel, ...(config.config.judgeFallbackModels ?? [])].join(' -> ')}` : ''}`);

  for (let i = 0; i < count; i++) {
    const result = await generateNextStory({
      repo,
      today: localDateString(),
      wiki: { fetchPage: (title) => fetchPage(title) },
      llm,
      ...(judge && { judge }),
      maxAttempts: MAX_ATTEMPTS_PER_STORY,
      maxModelCalls: MAX_MODEL_CALLS_PER_STORY,
      log: (line) => console.log(line),
    });

    if (result.status === 'published') {
      published += 1;
      console.log(`Published: ${result.title} (${result.id})`);
    } else if (result.status === 'no-topic') {
      console.log('No topic left to follow: every linked page already has a story or was rejected.');
      break;
    } else if (result.status === 'aborted') {
      console.error(`Stopped: ${result.reason}`);
      problem = true;
      break;
    } else {
      console.error(`Could not publish a story this time: ${result.reasons.length} problems, listed above.`);
      problem = true;
      break;
    }
  }

  for (const [label, client] of [['Model', llm], ['Judge', judge]] as const) {
    const usage = client?.usage?.();
    if (usage) console.log(`${label} usage: ${usage.calls} calls, ${usage.inputTokens} input and ${usage.outputTokens} output tokens.`);
  }
  console.log(`Done: ${published} new ${published === 1 ? 'story' : 'stories'}.`);

  // A scheduled run is marked failed (and the owner notified) only when something went wrong. Having nothing
  // left to write is not a failure.
  return problem ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Story generation failed: ${(err as Error).message}`);
    process.exit(1);
  },
);

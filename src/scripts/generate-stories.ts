// Generates new verified stories into content/stories. Run with `npm run stories:generate`.
import { loadConfig } from '../lib/config/env';
import { localDateString } from '../lib/habit/activity-log';
import { createAnthropicClient } from '../lib/pipeline/llm-client';
import { generateNextStory } from '../lib/pipeline/run';
import { fetchPage } from '../lib/pipeline/wikipedia';

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
  const loaded = loadConfig(process.env, process.cwd());
  if (!loaded.ok) {
    console.error('Cannot start:');
    loaded.problems.forEach((p) => console.error(`  - ${p}`));
    console.error('Run "npm run doctor" to see the whole setup.');
    return 1;
  }
  const { apiKey, model, storiesDir } = loaded.config;
  const llm = createAnthropicClient({ apiKey, model });

  const count = parseCount(process.argv.slice(2));
  let published = 0;
  console.log(`Writing to ${storiesDir} using ${model}`);

  for (let i = 0; i < count; i++) {
    const result = await generateNextStory({
      dir: storiesDir,
      today: localDateString(),
      wiki: { fetchPage: (title) => fetchPage(title) },
      llm,
      maxAttempts: MAX_ATTEMPTS_PER_STORY,
      maxModelCalls: MAX_MODEL_CALLS_PER_STORY,
    });

    if (result.status === 'published') {
      published += 1;
      console.log(`Published: ${result.title} (${result.id})`);
    } else if (result.status === 'no-topic') {
      console.log('No topic left to follow: every linked page already has a story or was rejected.');
      break;
    } else if (result.status === 'aborted') {
      console.error(`Stopped: ${result.reason}`);
      break;
    } else {
      console.error('Could not publish a story this time. Reasons:');
      result.reasons.forEach((r) => console.error(`  - ${r}`));
      break;
    }
  }

  const usage = llm.usage?.();
  if (usage) console.log(`Model usage: ${usage.calls} calls, ${usage.inputTokens} input and ${usage.outputTokens} output tokens.`);
  console.log(`Done: ${published} new ${published === 1 ? 'story' : 'stories'}.`);
  return published > 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Story generation failed: ${(err as Error).message}`);
    process.exit(1);
  },
);

// Generates new verified stories into content/stories. Run with `npm run stories:generate`.
import { localDateString } from '../lib/habit/activity-log';
import { createAnthropicClient } from '../lib/pipeline/llm-client';
import { generateNextStory } from '../lib/pipeline/run';
import { fetchPage } from '../lib/pipeline/wikipedia';
import { storiesDir } from '../lib/stories/catalog';

const MAX_COUNT = 10;
const MAX_ATTEMPTS_PER_STORY = 5;

function parseCount(args: string[]): number {
  const i = args.indexOf('--count');
  const n = i === -1 ? 1 : Number(args[i + 1]);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_COUNT) : 1;
}

async function main(): Promise<number> {
  let llm;
  try {
    llm = createAnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY ?? '', model: process.env.STORY_MODEL || 'claude-sonnet-5-5' });
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  const dir = storiesDir();
  const count = parseCount(process.argv.slice(2));
  let published = 0;
  console.log(`Writing to ${dir}`);

  for (let i = 0; i < count; i++) {
    const result = await generateNextStory({
      dir,
      today: localDateString(),
      wiki: { fetchPage: (title) => fetchPage(title) },
      llm,
      maxAttempts: MAX_ATTEMPTS_PER_STORY,
    });

    if (result.status === 'published') {
      published += 1;
      console.log(`Published: ${result.title} (${result.id})`);
    } else if (result.status === 'no-topic') {
      console.log('No topic left to follow: every linked page already has a story or was rejected.');
      break;
    } else {
      console.error('Could not publish a story this time. Reasons:');
      result.reasons.forEach((r) => console.error(`  - ${r}`));
      break;
    }
  }

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

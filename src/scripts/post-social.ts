// Posts the newest story to the channels you have set up (Telegram, Bluesky, Discord). Run with `npm run social:post`.
// Add `--dry-run` to see what would be posted without posting anything. A story is never posted to a channel twice.
import { chooseBackend } from '../lib/config/backend';
import { createSupabaseRest } from '../lib/db/supabase-rest';
import { siteUrl } from '../lib/share/share';
import { createBlueskyClient } from '../lib/social/bluesky';
import { ChannelConfig, loadSocialConfig } from '../lib/social/config';
import { createDiscordClient } from '../lib/social/discord';
import { createSocialStore, postNewestStory } from '../lib/social/post';
import { createTelegramClient, SocialClient } from '../lib/social/telegram';
import { getCatalog } from '../lib/stories/catalog';
import { createRepository } from '../lib/stories/get-repository';

function clientFor(config: ChannelConfig): SocialClient {
  if (config.channel === 'telegram') return createTelegramClient({ token: config.token, chatId: config.chatId });
  if (config.channel === 'bluesky') return createBlueskyClient({ handle: config.handle, appPassword: config.appPassword });
  return createDiscordClient({ webhookUrl: config.webhookUrl });
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');
  const { channels, problems } = loadSocialConfig(process.env);

  if (problems.length > 0) {
    console.error('A social channel is set up incorrectly:');
    problems.forEach((p) => console.error(`  - ${p}`));
    return 1;
  }
  if (channels.length === 0) {
    console.log('No social channels are set up (Telegram, Bluesky or Discord), so there is nothing to post. See DEPLOY.md, step 7.');
    return 0;
  }

  const backend = chooseBackend(process.env, process.cwd());
  if (backend.kind !== 'supabase') {
    console.error('Posting needs Supabase, to remember what has been posted. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return 1;
  }

  const base = siteUrl(process.env);
  if (!dryRun && /localhost|127\.0\.0\.1/.test(base)) {
    console.error('Set SITE_URL to your public address (for example https://rabbittrail.vercel.app), so the links in the posts work.');
    return 1;
  }

  const repo = createRepository(backend);
  const stories = await getCatalog(repo);
  const store = createSocialStore(createSupabaseRest({ url: backend.url, serviceKey: backend.serviceKey }));

  const results = await postNewestStory({ stories, store, clients: channels.map(clientFor), base, dryRun, log: (m) => console.log(m) });
  if (results.length === 0) console.log('There is no story to post yet.');
  for (const r of results) console.log(`${r.channel}: ${r.status}${r.reason ? ` (${r.reason})` : ''}${r.url ? ` ${r.url}` : ''}`);

  return results.some((r) => r.status === 'failed') ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`Posting failed: ${(err as Error).message}`);
    process.exitCode = 1;
  },
);

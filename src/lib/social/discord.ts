import { SocialPostError } from './errors';
import { SocialClient } from './telegram';

type Fetch = (url: string, init?: any) => Promise<any>;

export function createDiscordClient({ webhookUrl, fetchImpl }: { webhookUrl: string; fetchImpl?: Fetch }): SocialClient {
  const doFetch = fetchImpl ?? ((fetch as unknown) as Fetch);
  return {
    channel: 'discord',
    async post(post) {
      let res;
      try {
        // allowed_mentions off: a story text can never ping @everyone or a role.
        res = await doFetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: post.text, allowed_mentions: { parse: [] } }),
        });
      } catch {
        throw new SocialPostError('Discord could not be reached.');
      }
      if (res.ok) return; // Discord answers 204 with no body
      throw new SocialPostError(res.status === 429 ? 'Discord is rate limiting this webhook. It will be tried again next run.' : `Discord refused the post (${res.status}). Check DISCORD_WEBHOOK_URL.`);
    },
  };
}

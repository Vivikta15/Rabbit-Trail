import { ComposedPost } from './compose';
import { SocialPostError } from './errors';

export interface SocialClient {
  channel: 'telegram' | 'bluesky' | 'discord';
  post(post: ComposedPost): Promise<void>;
}

type Fetch = (url: string, init?: any) => Promise<any>;

export function createTelegramClient({ token, chatId, fetchImpl }: { token: string; chatId: string; fetchImpl?: Fetch }): SocialClient {
  const doFetch = fetchImpl ?? ((fetch as unknown) as Fetch);
  return {
    channel: 'telegram',
    async post(post) {
      let res;
      try {
        // The token is part of the address by design. A failure message therefore never includes the address.
        res = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: post.text, disable_web_page_preview: false }),
        });
      } catch {
        throw new SocialPostError('Telegram could not be reached.');
      }
      if (res.ok) return;
      let detail = '';
      try {
        detail = String((await res.json())?.description ?? '').slice(0, 120);
      } catch {
        // no readable body
      }
      throw new SocialPostError(`Telegram refused the post (${res.status})${detail ? `: ${detail}` : ''}.`);
    },
  };
}

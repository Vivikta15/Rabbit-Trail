// Posts the newest story to each configured channel exactly once. What has been posted is remembered in the database,
// so the twice-daily run, a manual run, or a retry after a failure can never post the same story to a channel twice.
import { Story } from '../../types';
import { DatabaseConflictError, SupabaseRest } from '../db/supabase-rest';
import { composePost } from './compose';
import { Channel } from './config';
import { SocialPostError } from './errors';
import { SocialClient } from './telegram';

export { SocialPostError } from './errors';

export interface SocialStore {
  hasPosted(storyId: string, channel: Channel): Promise<boolean>;
  markPosted(storyId: string, channel: Channel): Promise<void>;
}

export type ChannelResult = { channel: Channel; status: 'posted' | 'skipped' | 'failed' | 'dry-run'; reason?: string; url?: string };

export function createSocialStore(rest: SupabaseRest): SocialStore {
  return {
    async hasPosted(storyId, channel) {
      const rows = await rest.select('social_posts', `story_id=eq.${encodeURIComponent(storyId)}&channel=eq.${channel}&select=story_id&limit=1`);
      return rows.length > 0;
    },
    async markPosted(storyId, channel) {
      try {
        await rest.insert('social_posts', { story_id: storyId, channel });
      } catch (err) {
        if (!(err instanceof DatabaseConflictError)) throw err; // already remembered is fine
      }
    },
  };
}

function newest(stories: Story[]): Story | undefined {
  return [...stories].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
}

export async function postNewestStory(options: {
  stories: Story[];
  store: SocialStore;
  clients: SocialClient[];
  base: string;
  log?: (message: string) => void;
  dryRun?: boolean;
}): Promise<ChannelResult[]> {
  const { stories, store, clients, base, log, dryRun } = options;
  const story = newest(stories);
  if (!story || clients.length === 0) return [];

  const results: ChannelResult[] = [];
  for (const client of clients) {
    const { channel } = client;
    const composed = composePost(story, channel, base);

    // If we cannot tell whether it was already posted, we do not post: a double post is worse than a late one.
    let already: boolean;
    try {
      already = await store.hasPosted(story.id, channel);
    } catch (err) {
      results.push({ channel, status: 'failed', reason: `could not check whether it was already posted: ${(err as Error).message}` });
      continue;
    }
    if (already) {
      results.push({ channel, status: 'skipped', reason: 'already posted' });
      continue;
    }
    if (dryRun) {
      log?.(`[dry run] ${channel}: ${composed.text}`);
      results.push({ channel, status: 'dry-run', url: composed.url });
      continue;
    }

    try {
      await client.post(composed);
    } catch (err) {
      results.push({ channel, status: 'failed', reason: err instanceof SocialPostError ? err.message : `unexpected error: ${(err as Error).message}` });
      continue;
    }

    try {
      await store.markPosted(story.id, channel);
      results.push({ channel, status: 'posted', url: composed.url });
    } catch (err) {
      // It went out but could not be written down: say so loudly, because the next run may post it again.
      results.push({ channel, status: 'failed', reason: `posted, but could not be recorded (it may post again): ${(err as Error).message}` });
    }
  }
  return results;
}

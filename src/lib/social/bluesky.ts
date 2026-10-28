import { graphemeCount } from './compose';
import { SocialPostError } from './errors';
import { SocialClient } from './telegram';

type Fetch = (url: string, init?: any) => Promise<any>;

const API = 'https://bsky.social/xrpc';
const MAX_IMAGE_BYTES = 900 * 1024; // Bluesky refuses larger pictures

export function createBlueskyClient({ handle, appPassword, fetchImpl }: { handle: string; appPassword: string; fetchImpl?: Fetch }): SocialClient {
  const doFetch = fetchImpl ?? ((fetch as unknown) as Fetch);

  async function call(path: string, init: any, what: string) {
    try {
      return await doFetch(`${API}/${path}`, init);
    } catch {
      throw new SocialPostError(`Bluesky could not be reached (${what}).`);
    }
  }

  // The share card is a nicety: if it cannot be fetched or uploaded, the post goes out without it.
  async function uploadCard(imageUrl: string, jwt: string): Promise<unknown | undefined> {
    try {
      const image = await doFetch(imageUrl);
      if (!image.ok) return undefined;
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return undefined;
      const up = await doFetch(`${API}/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${jwt}` }, body: bytes });
      return up.ok ? (await up.json())?.blob : undefined;
    } catch {
      return undefined;
    }
  }

  return {
    channel: 'bluesky',
    async post(post) {
      const session = await call('com.atproto.server.createSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: handle, password: appPassword }) }, 'sign-in');
      if (session.status === 400 || session.status === 401) {
        throw new SocialPostError('Bluesky rejected the handle or app password. Make an app password in Bluesky Settings, under Privacy and security.');
      }
      if (!session.ok) throw new SocialPostError(`Bluesky sign-in failed (${session.status}).`);
      const { accessJwt, did } = await session.json();

      const thumb = await uploadCard(post.imageUrl, accessJwt);
      if (graphemeCount(post.text) > 300) throw new SocialPostError('The post is longer than Bluesky allows.');

      const created = await call(
        'com.atproto.repo.createRecord',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
          body: JSON.stringify({
            repo: did,
            collection: 'app.bsky.feed.post',
            record: {
              $type: 'app.bsky.feed.post',
              text: post.text,
              createdAt: new Date().toISOString(),
              langs: ['en'],
              embed: { $type: 'app.bsky.embed.external', external: { uri: post.url, title: post.title.slice(0, 300), description: post.description.slice(0, 300), ...(thumb ? { thumb } : {}) } },
            },
          }),
        },
        'posting',
      );
      if (!created.ok) throw new SocialPostError(`Bluesky refused the post (${created.status}).`);
    },
  };
}

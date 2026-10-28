// Links and words for sharing a story or a quiz result. Pure, so the same text is used on the share button, in the
// cards, and in the automatic daily posts.
import { cleanSource } from '../analytics/events';

export const MAX_SHARE_CHARS = 240;
const CHECKED = 'Every claim is checked against its source.';

function webAddress(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? `${url.protocol}//${url.host}` : null;
  } catch {
    return null;
  }
}

// The public address of this site, for links that leave it (share links, cards, daily posts).
export function siteUrl(env: Record<string, string | undefined>): string {
  const explicit = webAddress(env.SITE_URL);
  if (explicit) return explicit;
  const vercel = (env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim();
  const fromVercel = vercel ? webAddress(`https://${vercel}`) : null;
  return fromVercel ?? 'http://localhost:3000';
}

// Joins the site and a path on this site, and tags the channel so a visit can be traced back to it.
export function shareUrl(base: string, path: string, source: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('A share path must be a path on this site');
  const url = new URL(path, `${base.replace(/\/+$/, '')}/`);
  url.searchParams.set('utm_source', cleanSource(source));
  return url.toString();
}

export const storyPath = (storyId: string) => `/story/${storyId}`;
export const archetypePath = (archetypeId: string) => `/onboarding?archetype=${encodeURIComponent(archetypeId)}`;

const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

interface ShareableStory {
  title: string;
  facts: { claim: string }[];
  counterArgument?: { thesis: string };
}

// A short post: the story, one fact, the other side, and that the claims are checked. The closing line is always kept,
// so a long story shortens the middle and never the promise.
export function storyShareText(story: ShareableStory): string {
  const title = clip(story.title, 90);
  const fact = story.facts[0]?.claim;
  const other = story.counterArgument?.thesis;
  const tail = other ? `\nThe other side: ${clip(other, 70)}\n${CHECKED}` : `\n${CHECKED}`;

  const room = MAX_SHARE_CHARS - title.length - tail.length - 2;
  const middle = fact && room > 20 ? `\n${clip(fact, room)}` : '';
  const text = `${title}${middle}${tail}`;
  return text.length <= MAX_SHARE_CHARS ? text : `${title}\n${CHECKED}`;
}

export function archetypeShareText(archetypeName: string): string {
  return `I'm ${archetypeName}. What's your curiosity archetype? A one-minute quiz.`;
}

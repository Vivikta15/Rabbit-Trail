// The words and link for one story on one channel. Each channel has its own limit, and each link carries its own
// channel name so a visit can be traced back to the post that brought it.
import { Story } from '../../types';
import { shareUrl, storyPath, storyShareText } from '../share/share';
import { Channel } from './config';

export interface ComposedPost {
  storyId: string;
  channel: Channel;
  text: string;
  url: string;
  title: string;
  description: string;
  imageUrl: string;
}

type SegmenterCtor = new (locale?: string, options?: { granularity: string }) => { segment(text: string): Iterable<unknown> };

// Bluesky counts what a reader sees as one character (an emoji, an accented letter), not bytes or code units.
export function graphemeCount(text: string): number {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (!Segmenter) return Array.from(text).length;
  return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;
}

export function composePost(story: Story, channel: Channel, base: string): ComposedPost {
  const url = shareUrl(base, storyPath(story.id), channel);
  const body = storyShareText(story);
  // Telegram and Discord show a preview card from the link; Bluesky gets the link as an attached card instead.
  const text = channel === 'bluesky' ? body : `${body}\n\n${url}`;

  return {
    storyId: story.id,
    channel,
    text,
    url,
    title: story.title,
    description: story.facts[0]?.claim ?? story.decisionContext,
    imageUrl: `${base.replace(/\/+$/, '')}/api/og?story=${encodeURIComponent(story.id)}`,
  };
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StoryViewer from '../../../components/story/StoryViewer';
import AccessGate from '../../../components/subscription/AccessGate';
import { renderPersonalizedStory } from '../../../lib/llm/rewrite-engine';
import { parseSharedArchetype } from '../../../lib/share/archetype-share';
import { storyShareText } from '../../../lib/share/share';
import { getStoryById } from '../../../lib/stories/catalog';
import { getRepository } from '../../../lib/stories/get-repository';

export const dynamic = 'force-dynamic';

// What a link to this story looks like when it is shared: its title, a verified fact, and a card with the rabbit.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const story = await getStoryById(getRepository(), params.id);
    if (!story) return {};
    const description = story.facts[0]?.claim ?? story.decisionContext;
    const image = `/api/og?story=${encodeURIComponent(story.id)}`;
    return {
      title: `${story.title} · Rabbit Trail`,
      description,
      openGraph: { title: story.title, description, type: 'article', images: [image] },
      twitter: { card: 'summary_large_image', title: story.title, description, images: [image] },
    };
  } catch {
    return {};
  }
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { archetype?: string | string[] };
}) {
  const story = await getStoryById(getRepository(), params.id);
  if (!story) notFound();

  const requested = Array.isArray(searchParams.archetype) ? searchParams.archetype[0] : searchParams.archetype;
  const archetypeId = parseSharedArchetype(requested) ?? 'cartographer';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <p className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Rabbit Trail</p>
      <AccessGate feature="story" storyId={story.id}>
        <StoryViewer
          key={archetypeId}
          storyId={story.id}
          topic={story.topic}
          era={story.era}
          initialArchetypeId={archetypeId}
          initialStory={renderPersonalizedStory(story, archetypeId)}
          shareText={storyShareText(story)}
        />
      </AccessGate>
    </main>
  );
}

import { notFound } from 'next/navigation';
import StoryViewer from '../../../components/story/StoryViewer';
import { VERIFIED_STORIES } from '../../../data/stories';
import { renderPersonalizedStory } from '../../../lib/llm/rewrite-engine';
import { parseSharedArchetype } from '../../../lib/share/archetype-share';

export default function StoryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { archetype?: string | string[] };
}) {
  const story = VERIFIED_STORIES.find((s) => s.id === params.id);
  if (!story) notFound();

  const requested = Array.isArray(searchParams.archetype) ? searchParams.archetype[0] : searchParams.archetype;
  const archetypeId = parseSharedArchetype(requested) ?? 'cartographer';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <p className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Rabbit Trail</p>
      <StoryViewer
        key={archetypeId}
        storyId={story.id}
        topic={story.topic}
        era={story.era}
        initialArchetypeId={archetypeId}
        initialStory={renderPersonalizedStory(story, archetypeId)}
      />
    </main>
  );
}

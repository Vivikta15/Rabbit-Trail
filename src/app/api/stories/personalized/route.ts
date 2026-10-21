import { NextResponse } from 'next/server';
import { VERIFIED_STORIES } from '../../../../data/stories';
import { renderPersonalizedStory } from '../../../../lib/llm/rewrite-engine';
import { parseSharedArchetype } from '../../../../lib/share/archetype-share';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const story = VERIFIED_STORIES.find((s) => s.id === params.get('storyId'));
  const archetypeId = parseSharedArchetype(params.get('archetype'));

  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }
  if (!archetypeId) {
    return NextResponse.json({ error: 'Unknown archetype' }, { status: 400 });
  }

  return NextResponse.json(renderPersonalizedStory(story, archetypeId));
}

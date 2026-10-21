import { NextResponse } from 'next/server';
import { renderPersonalizedStory } from '../../../../lib/llm/rewrite-engine';
import { parseSharedArchetype } from '../../../../lib/share/archetype-share';
import { loadCatalog } from '../../../../lib/stories/catalog';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const story = loadCatalog().find((s) => s.id === params.get('storyId'));
  const archetypeId = parseSharedArchetype(params.get('archetype'));

  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }
  if (!archetypeId) {
    return NextResponse.json({ error: 'Unknown archetype' }, { status: 400 });
  }

  return NextResponse.json(renderPersonalizedStory(story, archetypeId));
}

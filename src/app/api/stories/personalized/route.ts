import { NextResponse } from 'next/server';
import { cleanParam } from '../../../../lib/api/validate';
import { renderPersonalizedStory } from '../../../../lib/llm/rewrite-engine';
import { parseSharedArchetype } from '../../../../lib/share/archetype-share';
import { loadCatalog } from '../../../../lib/stories/catalog';

export const dynamic = 'force-dynamic';

const MAX_ID_LENGTH = 120;

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const storyId = cleanParam(params.get('storyId'), MAX_ID_LENGTH);
  const archetypeId = parseSharedArchetype(params.get('archetype'));

  if (!storyId) {
    return NextResponse.json({ error: 'Provide a storyId' }, { status: 400 });
  }
  if (!archetypeId) {
    return NextResponse.json({ error: 'Unknown archetype' }, { status: 400 });
  }

  const story = loadCatalog().find((s) => s.id === storyId);
  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }

  return NextResponse.json(renderPersonalizedStory(story, archetypeId));
}

import { NextResponse } from 'next/server';
import { cleanParam } from '../../../../lib/api/validate';
import { renderPersonalizedStory } from '../../../../lib/llm/rewrite-engine';
import { parseSharedArchetype } from '../../../../lib/share/archetype-share';
import { getStoryById } from '../../../../lib/stories/catalog';
import { getRepository } from '../../../../lib/stories/get-repository';

export const dynamic = 'force-dynamic';

const MAX_ID_LENGTH = 120;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const storyId = cleanParam(params.get('storyId'), MAX_ID_LENGTH);
  const archetypeId = parseSharedArchetype(params.get('archetype'));

  if (!storyId) {
    return NextResponse.json({ error: 'Provide a storyId' }, { status: 400 });
  }
  if (!archetypeId) {
    return NextResponse.json({ error: 'Unknown archetype' }, { status: 400 });
  }

  try {
    const story = await getStoryById(getRepository(), storyId);
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    return NextResponse.json(renderPersonalizedStory(story, archetypeId));
  } catch (err) {
    // The reason goes to the server log; the caller only learns that stories are unavailable right now.
    console.error('Story store unavailable:', (err as Error).message);
    return NextResponse.json({ error: 'Stories are temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
}

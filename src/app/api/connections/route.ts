import { NextResponse } from 'next/server';
import { cleanParam } from '../../../lib/api/validate';
import { exploreConnection } from '../../../lib/graph/pathfinder';

const MAX_TERM_LENGTH = 80;

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const a = cleanParam(params.get('a'), MAX_TERM_LENGTH);
  const b = cleanParam(params.get('b'), MAX_TERM_LENGTH);

  if (!a || !b) {
    return NextResponse.json({ error: `Provide both concepts as ?a=...&b=... (each up to ${MAX_TERM_LENGTH} characters)` }, { status: 400 });
  }

  return NextResponse.json(exploreConnection(a, b));
}

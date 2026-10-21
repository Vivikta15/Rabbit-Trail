import { NextResponse } from 'next/server';
import { exploreConnection } from '../../../lib/graph/pathfinder';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const a = params.get('a')?.trim();
  const b = params.get('b')?.trim();

  if (!a || !b) {
    return NextResponse.json({ error: 'Provide both concepts as ?a=...&b=...' }, { status: 400 });
  }

  return NextResponse.json(exploreConnection(a, b));
}

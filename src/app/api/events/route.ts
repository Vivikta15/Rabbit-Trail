import { NextResponse } from 'next/server';
import { handleEventRequest } from '../../../lib/analytics/events-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { status, body } = await handleEventRequest({
    method: request.method,
    bodyText: await request.text(),
    origin: request.headers.get('origin'),
    host: request.headers.get('host'),
    env: process.env,
    // The server's own day (UTC on Vercel), so a visitor is counted once per step per day.
    today: new Date().toISOString().slice(0, 10),
  });
  return body ? NextResponse.json(body, { status }) : new NextResponse(null, { status });
}

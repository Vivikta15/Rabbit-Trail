import { NextResponse } from 'next/server';
import { handleReaderRequest } from '../../../../lib/accounts/reader-api';
import { localDateString } from '../../../../lib/habit/activity-log';

export const dynamic = 'force-dynamic';

async function respond(request: Request) {
  const bodyText = request.method === 'PUT' ? await request.text() : '';
  const { status, body } = await handleReaderRequest({
    method: request.method,
    authorization: request.headers.get('authorization'),
    bodyText,
    env: process.env,
    today: localDateString(),
  });
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = respond;
export const PUT = respond;

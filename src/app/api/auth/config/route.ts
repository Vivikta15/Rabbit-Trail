import { NextResponse } from 'next/server';
import { loadAuthConfig } from '../../../../lib/accounts/auth';

export const dynamic = 'force-dynamic';

// Tells the browser how to reach sign-in. It only ever carries the project address and the PUBLIC key: loadAuthConfig
// refuses a secret key, and a problem is logged here but never sent on.
export async function GET() {
  const config = loadAuthConfig(process.env);
  if (!config.enabled) {
    if (process.env.SUPABASE_PUBLISHABLE_KEY) console.error(`Sign-in is off: ${config.problem}`);
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ enabled: true, url: config.url, publishableKey: config.publishableKey, google: config.google }, { headers: { 'Cache-Control': 'no-store' } });
}

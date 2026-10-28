// The logic behind POST /api/events, kept apart from Next.js so it can be tested. It stores one anonymous funnel event.
// Counting is never allowed to hurt the site: with no Supabase backend it is simply off, and a repeat is not an error.
import { chooseBackend } from '../config/backend';
import { createSupabaseRest, DatabaseConflictError } from '../db/supabase-rest';
import { WEB_TUNING } from '../stories/get-repository';
import { cleanEvent } from './events';

export interface EventRequest {
  method: string;
  bodyText: string;
  origin: string | null;
  host: string | null;
  env: Record<string, string | undefined>;
  today: string;
  cwd?: string;
  fetchImpl?: (url: string, init: any) => Promise<any>;
  log?: (message: string) => void;
}

const MAX_BODY_CHARS = 1024;

function sameSite(origin: string | null, host: string | null): boolean {
  if (!origin) return true; // a plain beacon may carry no Origin header
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handleEventRequest(req: EventRequest): Promise<{ status: number; body?: { error: string } }> {
  const log = req.log ?? ((m: string) => console.error(m));
  if (req.method !== 'POST') return { status: 405, body: { error: 'Use POST.' } };
  if (!sameSite(req.origin, req.host)) return { status: 403, body: { error: 'Not allowed.' } };
  if (req.bodyText.length > MAX_BODY_CHARS) return { status: 413, body: { error: 'Too large.' } };

  let event;
  try {
    event = cleanEvent(JSON.parse(req.bodyText));
  } catch {
    event = null;
  }
  if (!event) return { status: 400, body: { error: 'Not a valid event.' } };

  const backend = chooseBackend(req.env, req.cwd ?? process.cwd());
  if (backend.kind !== 'supabase') return { status: 204 };

  try {
    const rest = createSupabaseRest({ url: backend.url, serviceKey: backend.serviceKey, fetchImpl: req.fetchImpl, ...WEB_TUNING });
    await rest.insert('launch_events', { day: req.today, name: event.name, visitor: event.visitor, source: event.source });
    return { status: 204 };
  } catch (err) {
    if (err instanceof DatabaseConflictError) return { status: 204 }; // this visitor already counted for this step today
    log(`Event not stored: ${(err as Error).message}`);
    return { status: 503, body: { error: 'Try again later.' } };
  }
}

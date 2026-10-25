// The logic behind /api/reader/state, kept apart from Next.js so it can be tested. It answers one question for a signed-in
// reader: what have I saved, and (on save) merge what this browser has into it.
//
// Who is asking is decided only by asking Supabase about the token; nothing in the request body can name a reader, and
// the request can never set whether the reader has paid.
import { chooseBackend } from '../config/backend';
import { createSupabaseRest } from '../db/supabase-rest';
import { WEB_TUNING } from '../stories/get-repository';
import { AccountsUnavailable, extractBearer, verifyAccessToken } from './auth';
import { cleanReaderState, emptyReaderState, mergeReaderStates, ReaderState } from './reader-state';

export interface ReaderRequest {
  method: string;
  authorization: string | null;
  bodyText: string;
  env: Record<string, string | undefined>;
  today: string;
  cwd?: string;
  fetchImpl?: (url: string, init: any) => Promise<any>;
  log?: (message: string) => void;
}

export interface ReaderResponse {
  status: number;
  body: { state: ReaderState; subscribed: boolean } | { error: string };
}

const MAX_BODY_CHARS = 600 * 1024;
const TABLE = 'reader_state';
const BUSY = 'Your trail could not be reached just now. Please try again in a moment.';

const error = (status: number, message: string): ReaderResponse => ({ status, body: { error: message } });

export async function handleReaderRequest(req: ReaderRequest): Promise<ReaderResponse> {
  const log = req.log ?? ((m: string) => console.error(m));
  if (req.method !== 'GET' && req.method !== 'PUT') return error(405, 'Use GET or PUT.');

  const backend = chooseBackend(req.env, req.cwd ?? process.cwd());
  if (backend.kind !== 'supabase') return error(503, 'Saving your trail is not available on this site yet.');

  const token = extractBearer(req.authorization);
  if (!token) return error(401, 'Please sign in.');

  try {
    const who = await verifyAccessToken({ url: backend.url, serviceKey: backend.serviceKey, token, fetchImpl: req.fetchImpl });
    if (!who) return error(401, 'Please sign in again.');

    let incoming: ReaderState | null = null;
    if (req.method === 'PUT') {
      if (req.bodyText.length > MAX_BODY_CHARS) return error(413, 'That is too much to save at once.');
      try {
        incoming = cleanReaderState(JSON.parse(req.bodyText), req.today);
      } catch {
        return error(400, 'That could not be read.');
      }
    }

    const rest = createSupabaseRest({ url: backend.url, serviceKey: backend.serviceKey, fetchImpl: req.fetchImpl, ...WEB_TUNING });
    const [row] = await rest.select(TABLE, `user_id=eq.${who.userId}&select=archetype,trial_start_date,activity,subscribed&limit=1`);
    const saved = cleanReaderState(row ? { archetype: row.archetype, trialStartDate: row.trial_start_date, activity: row.activity } : emptyReaderState(), req.today);
    const subscribed = row?.subscribed === true;

    if (!incoming) return { status: 200, body: { state: saved, subscribed } };

    const merged = mergeReaderStates(saved, incoming, req.today);
    // `subscribed` is left out on purpose, so a save can never change it.
    await rest.upsert(
      TABLE,
      { user_id: who.userId, archetype: merged.archetype, trial_start_date: merged.trialStartDate, activity: merged.activity, updated_at: new Date().toISOString() },
      'user_id',
    );
    return { status: 200, body: { state: merged, subscribed } };
  } catch (err) {
    // The reason goes to the server log; the reader only learns to try again.
    log(`Reader state unavailable${err instanceof AccountsUnavailable ? ' (auth)' : ''}: ${(err as Error).message}`);
    return error(503, BUSY);
  }
}

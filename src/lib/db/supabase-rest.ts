// A minimal client for Supabase's REST API (PostgREST), server-side only. It uses the service key, which can read
// and write everything: that key must never reach the browser. It reuses the retry and timeout layer so a brief
// outage is ridden out and a lasting one stops with a clear message.
import { AuthError, fetchWithTimeout, HttpStatusError, PipelineAbort, RetryOptions, retryAfterMs, TimeoutError, withRetry } from '../pipeline/http';

export class DatabaseConflictError extends Error {}

// The table or function is missing: the migration has not been run (or the URL points at the wrong project).
export class DatabaseSchemaError extends PipelineAbort {}

interface RestResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<any>;
  text(): Promise<string>;
}

export interface SupabaseRestOptions {
  url: string;
  serviceKey: string;
  fetchImpl?: (url: string, init: any) => Promise<RestResponse>;
  retry?: RetryOptions;
  timeoutMs?: number;
}

const PAGE_SIZE = 500; // under Supabase's default cap of 1000 rows per request
const SCHEMA_CODES = new Set(['PGRST205', 'PGRST202', '42P01', '42883']);

export interface SupabaseRest {
  select(table: string, query: string): Promise<any[]>;
  selectAll(table: string, query: string): Promise<any[]>;
  insert(table: string, row: Record<string, unknown>): Promise<void>;
  // Inserts the row, or updates the row that has the same value in `conflictColumn` (its primary key).
  upsert(table: string, row: Record<string, unknown>, conflictColumn: string): Promise<void>;
  rpc(fn: string, args: Record<string, unknown>): Promise<any>;
}

async function readError(res: RestResponse): Promise<{ code: string; message: string }> {
  try {
    const body = JSON.parse(await res.text());
    return { code: String(body?.code ?? ''), message: String(body?.message ?? '').slice(0, 300) };
  } catch {
    return { code: '', message: '' };
  }
}

export function createSupabaseRest({ url, serviceKey, fetchImpl, retry, timeoutMs = 20000 }: SupabaseRestOptions): SupabaseRest {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const doFetch = fetchImpl ?? ((fetch as unknown) as NonNullable<SupabaseRestOptions['fetchImpl']>);
  const retryOptions: RetryOptions = { retries: 3, baseDelayMs: 1000, maxDelayMs: 15000, ...retry };

  async function request(method: 'GET' | 'POST', pathAndQuery: string, what: string, body?: unknown, wantBody = true, prefer?: string): Promise<any> {
    const headers: Record<string, string> = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(method === 'POST' && pathAndQuery.startsWith('/rpc/') === false ? { Prefer: prefer ?? 'return=minimal' } : {}),
    };

    let res: RestResponse;
    try {
      res = await withRetry(async () => {
        // cache: 'no-store' matters: Next.js otherwise caches server-side fetches, which would hide a newly saved
        // story from readers until the cache expired.
        const r = await fetchWithTimeout(doFetch, `${base}${pathAndQuery}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }, timeoutMs);
        if (!r.ok) throw Object.assign(new HttpStatusError(`status ${r.status}`, r.status, retryAfterMs(r.headers?.get('retry-after'))), { response: r });
        return r;
      }, retryOptions);
    } catch (err) {
      if (err instanceof HttpStatusError) {
        const { code, message } = await readError((err as HttpStatusError & { response: RestResponse }).response);
        if (err.status === 401 || err.status === 403) {
          throw new AuthError(`Supabase rejected the service key (${err.status}). Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Use the secret "service_role" key, not the public one.`);
        }
        if (err.status === 409 || code === '23505') throw new DatabaseConflictError(message || 'duplicate record');
        if (err.status === 404 || SCHEMA_CODES.has(code)) {
          throw new DatabaseSchemaError(`Supabase does not have "${what}". Open the Supabase SQL editor and run every file in supabase/migrations, in order (0001_stories.sql, 0002_reader_state.sql, 0003_launch_growth.sql). If you already did, check that SUPABASE_URL points at that project.`);
        }
        if (err.status >= 500 || err.status === 429 || err.status === 408) {
          throw new PipelineAbort(`Supabase is busy or unreachable (${err.status}). Please try again later.`);
        }
        throw new PipelineAbort(`Supabase rejected the request (${err.status})${message ? `: ${message}` : ''}.`);
      }
      throw new PipelineAbort(`Could not reach Supabase (${(err as Error).message}). Check SUPABASE_URL and your connection, then try again later.`);
    }
    if (!wantBody) return undefined;

    // A function that returns nothing (like releasing the lock) comes back with no body at all: that is "no
    // value", not an error. Anything else must be valid JSON.
    const text = await res.text();
    if (text.trim() === '') return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new PipelineAbort('Supabase sent an answer this app could not read. Please try again later.');
    }
  }

  const client: SupabaseRest = {
    select: (table, query) => request('GET', `/${table}?${query}`, table),

    // Pages through every row. The caller's query must carry a stable `order`, or pages could overlap.
    async selectAll(table, query) {
      const rows: any[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await client.select(table, `${query}&limit=${PAGE_SIZE}&offset=${offset}`);
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
      }
    },

    async insert(table, row) {
      await request('POST', `/${table}`, table, row, false);
    },

    async upsert(table, row, conflictColumn) {
      await request('POST', `/${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, table, row, false, 'resolution=merge-duplicates,return=minimal');
    },

    rpc: (fn, args) => request('POST', `/rpc/${fn}`, fn, args),
  };
  return client;
}

// Server side of sign-in: who is asking, and which key may be shown to a browser.
//
// The browser signs in with Supabase Auth itself, using the PUBLIC (publishable) key. It then sends the token it was
// given to this app's own routes. The server never trusts that token on its own: it asks Supabase who it belongs to.
import { validateSupabaseUrl } from '../config/backend';
import { fetchWithTimeout } from '../pipeline/http';
import { decodeJwtPayload, UUID } from './jwt';

// Supabase could not be asked. Not the same as "this token is bad": a reader must not look signed out in an outage.
export class AccountsUnavailable extends Error {}

const MAX_TOKEN_CHARS = 4096;

export function extractBearer(header: string | null | undefined): string | null {
  const match = /^bearer ([^\s]+)$/i.exec((header ?? '').trim());
  return match && match[1].length <= MAX_TOKEN_CHARS ? match[1] : null;
}

export interface VerifyOptions {
  url: string;
  serviceKey: string;
  token: string;
  fetchImpl?: (url: string, init: any) => Promise<any>;
  timeoutMs?: number;
}

export async function verifyAccessToken({ url, serviceKey, token, fetchImpl, timeoutMs = 8000 }: VerifyOptions): Promise<{ userId: string; email: string | null } | null> {
  const doFetch = fetchImpl ?? ((fetch as unknown) as NonNullable<VerifyOptions['fetchImpl']>);
  let res;
  try {
    res = await fetchWithTimeout(
      doFetch,
      `${url.replace(/\/+$/, '')}/auth/v1/user`,
      { method: 'GET', headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }, cache: 'no-store' },
      timeoutMs,
    );
  } catch (err) {
    throw new AccountsUnavailable(`Could not reach Supabase Auth (${(err as Error).message}).`);
  }

  if (res.status === 400 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new AccountsUnavailable(`Supabase Auth answered ${res.status}.`);

  let body: any;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return null;
  return { userId: body.id.toLowerCase(), email: typeof body.email === 'string' ? body.email : null };
}

export type PublishableKeyCheck = { ok: true; key: string } | { ok: false; problem: string };

const SECRET_PROBLEM = 'That is a secret key. Only the public "publishable" key (it starts with "sb_publishable_") may be used for sign-in, because it is sent to browsers. Keep the secret key only in SUPABASE_SERVICE_ROLE_KEY.';

// The key in this slot is sent to every visitor's browser, so the one thing that must never happen is a secret key
// ending up here. Anything that is not clearly a public key is refused.
export function validatePublishableKey(raw: string | undefined): PublishableKeyCheck {
  let value = (raw ?? '').trim();
  if (/^(["']).*\1$/s.test(value)) value = value.slice(1, -1).trim();
  if (!value) return { ok: false, problem: 'SUPABASE_PUBLISHABLE_KEY is not set. Copy the publishable key from Supabase: Project Settings -> API Keys.' };
  if (/\s/.test(value)) return { ok: false, problem: 'The key contains a space or line break. Paste only the key, on one line.' };

  if (value.startsWith('sb_secret_')) return { ok: false, problem: SECRET_PROBLEM };
  if (value.startsWith('sb_publishable_')) {
    return value.length >= 30 && /^[A-Za-z0-9_-]+$/.test(value) ? { ok: true, key: value } : { ok: false, problem: 'The publishable key looks incomplete or has odd characters. Copy it again.' };
  }

  // The older style of key is a JWT whose role says what it is.
  const payload = value.startsWith('eyJ') ? decodeJwtPayload(value) : null;
  if (payload?.role === 'anon') return { ok: true, key: value };
  if (payload?.role) return { ok: false, problem: SECRET_PROBLEM };
  return { ok: false, problem: 'That does not look like a Supabase publishable key. It starts with "sb_publishable_".' };
}

export type AuthConfig = { enabled: true; url: string; publishableKey: string } | { enabled: false; problem: string };

// What the browser is told about sign-in. Sign-in is simply off (never half-on) unless both values are good.
export function loadAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const url = validateSupabaseUrl(env.SUPABASE_URL);
  if (!url.ok) return { enabled: false, problem: url.problem };

  const key = validatePublishableKey(env.SUPABASE_PUBLISHABLE_KEY);
  if (!key.ok) return { enabled: false, problem: key.problem };

  const service = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (service && service === key.key) return { enabled: false, problem: SECRET_PROBLEM };

  return { enabled: true, url: url.url, publishableKey: key.key };
}

// Browser side of sign-in. Pure helpers plus small calls to Supabase Auth using only the PUBLIC key. A signed-in reader
// holds a session (a short-lived access token and a longer-lived refresh token) in this browser's storage.
import { decodeJwtPayload, UUID } from './jwt';

export const SESSION_STORAGE_KEY = 'rabbit-trail:session:v1';
const REFRESH_MARGIN_SECONDS = 60;
const MAX_EMAIL_CHARS = 254;

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // seconds since 1970
  userId: string;
  email: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

type Fetch = (url: string, init: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

function buildSession(accessToken: unknown, refreshToken: unknown, expiresIn: unknown, now: number): Session | null {
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || !refreshToken) return null;
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload.sub !== 'string' || !UUID.test(payload.sub)) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: now + Math.floor(seconds),
    userId: payload.sub.toLowerCase(),
    email: typeof payload.email === 'string' ? payload.email : null,
  };
}

const EXPIRED = 'That sign-in link has expired or was already used. Please ask for a new link.';
const GENERIC = 'Sign-in did not work. Please try again.';

// Supabase sends the reader back to the site with the result in the part of the address after "#". Returns null when
// the address has nothing to do with sign-in.
export function parseAuthRedirect(hash: string, now: number): { ok: true; session: Session } | { ok: false; message: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));

  if (params.has('error') || params.has('error_code')) {
    const code = params.get('error_code') ?? '';
    const description = params.get('error_description') ?? '';
    return { ok: false, message: /expired|invalid/i.test(`${code} ${description}`) ? EXPIRED : GENERIC };
  }
  if (!params.has('access_token')) return null;

  const session = buildSession(params.get('access_token'), params.get('refresh_token'), params.get('expires_in'), now);
  return session ? { ok: true, session } : { ok: false, message: GENERIC };
}

export function needsRefresh(session: Pick<Session, 'expiresAt'>, now: number): boolean {
  return now >= session.expiresAt - REFRESH_MARGIN_SECONDS;
}

export function buildGoogleSignInUrl(url: string, redirectTo: string): string {
  const u = new URL(`${url.replace(/\/+$/, '')}/auth/v1/authorize`);
  u.searchParams.set('provider', 'google');
  u.searchParams.set('redirect_to', redirectTo);
  return u.toString();
}

export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length <= MAX_EMAIL_CHARS && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function requestMagicLink(options: { url: string; publishableKey: string; email: string; redirectTo: string; fetchImpl?: Fetch }): Promise<{ ok: true } | { ok: false; message: string }> {
  const email = options.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, message: 'Please enter a valid email address.' };

  const doFetch = options.fetchImpl ?? ((fetch as unknown) as Fetch);
  try {
    const res = await doFetch(`${options.url.replace(/\/+$/, '')}/auth/v1/otp?redirect_to=${encodeURIComponent(options.redirectTo)}`, {
      method: 'POST',
      headers: { apikey: options.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, create_user: true }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: false, message: 'Too many emails were requested. Please wait a minute and try again.' };
    return { ok: false, message: 'We could not send the link right now. Please try again in a moment.' };
  } catch {
    return { ok: false, message: 'We could not reach the sign-in service. Check your connection and try again.' };
  }
}

// A rejected refresh token means the reader must sign in again; an outage must not sign anyone out.
export async function refreshSession(options: { url: string; publishableKey: string; refreshToken: string; now: number; fetchImpl?: Fetch }): Promise<{ ok: true; session: Session } | { ok: false; signedOut: boolean }> {
  const doFetch = options.fetchImpl ?? ((fetch as unknown) as Fetch);
  try {
    const res = await doFetch(`${options.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: options.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: options.refreshToken }),
    });
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, signedOut: true };
    if (!res.ok) return { ok: false, signedOut: false };
    const body = await res.json();
    const session = buildSession(body?.access_token, body?.refresh_token, body?.expires_in, options.now);
    return session ? { ok: true, session } : { ok: false, signedOut: false };
  } catch {
    return { ok: false, signedOut: false };
  }
}

export function loadSession(storage: StorageLike | null): Session | null {
  if (!storage) return null;
  try {
    const s = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) ?? 'null');
    if (
      s &&
      typeof s.accessToken === 'string' &&
      typeof s.refreshToken === 'string' &&
      typeof s.expiresAt === 'number' &&
      typeof s.userId === 'string' &&
      UUID.test(s.userId) &&
      (s.email === null || typeof s.email === 'string')
    ) {
      return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt, userId: s.userId, email: s.email };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(storage: StorageLike | null, session: Session): void {
  try {
    storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Blocked or full storage: the reader stays signed in until the page closes.
  }
}

export function clearSession(storage: StorageLike | null): void {
  try {
    if (storage?.removeItem) storage.removeItem(SESSION_STORAGE_KEY);
    else storage?.setItem(SESSION_STORAGE_KEY, 'null');
  } catch {
    // Nothing more can be done.
  }
}

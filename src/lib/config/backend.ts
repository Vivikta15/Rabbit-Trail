import path from 'node:path';

// Decides where stories live from the environment: Supabase when it is configured, local files when it is not, and
// a loud error for anything in between. Messages say what to do and never repeat a key.

export type BackendChoice =
  | { kind: 'supabase'; url: string; serviceKey: string }
  | { kind: 'file'; dir: string }
  | { kind: 'error'; problems: string[] };

export type UrlCheck = { ok: true; url: string } | { ok: false; problem: string };
export type ServiceKeyCheck = { ok: true; key: string } | { ok: false; problem: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validateSupabaseUrl(raw: string | undefined): UrlCheck {
  const value = (raw ?? '').trim();
  if (!value) return { ok: false, problem: 'SUPABASE_URL is not set. Copy the Project URL from Supabase: Project Settings -> API.' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, problem: 'SUPABASE_URL must be a full address starting with https:// (for example https://abcdefghij.supabase.co).' };
  }

  if (url.hostname === 'supabase.com' || url.hostname === 'app.supabase.com') {
    return { ok: false, problem: 'That is the Supabase dashboard address. You need the Project URL from Project Settings -> API (it looks like https://abcdefghij.supabase.co).' };
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    return { ok: false, problem: 'SUPABASE_URL must use https:// (plain http is only allowed for a local Supabase on this computer).' };
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    return { ok: false, problem: 'SUPABASE_URL should be just the project URL, with nothing after the host (no /rest/v1 or other path).' };
  }
  return { ok: true, url: url.origin };
}

function jwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function validateServiceKey(raw: string | undefined): ServiceKeyCheck {
  let value = (raw ?? '').trim();
  if (/^(["']).*\1$/s.test(value)) value = value.slice(1, -1).trim();
  if (!value) return { ok: false, problem: 'SUPABASE_SERVICE_ROLE_KEY is not set. Copy the secret key from Supabase: Project Settings -> API Keys.' };
  if (/\s/.test(value)) return { ok: false, problem: 'The Supabase key contains a space or line break. Paste only the key, on one line.' };

  if (value.startsWith('sb_publishable_')) {
    return { ok: false, problem: 'That is the public (publishable) key. The server needs the secret key, which starts with "sb_secret_".' };
  }
  if (value.startsWith('sb_secret_')) {
    if (value.length < 20) return { ok: false, problem: 'The Supabase secret key looks incomplete (too short). Copy the whole key again.' };
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return { ok: false, problem: 'The Supabase key contains characters a key never has. Copy it again.' };
    return { ok: true, key: value };
  }
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value)) {
    const role = jwtRole(value);
    if (role === 'service_role') return { ok: true, key: value };
    if (role === 'anon') return { ok: false, problem: 'That is the public "anon" key. The server needs the secret "service_role" key (or a key starting with "sb_secret_").' };
    return { ok: false, problem: 'That key is not a Supabase service_role key. Copy the secret key from Project Settings -> API Keys.' };
  }
  return { ok: false, problem: 'That does not look like a Supabase key. Secret keys start with "sb_secret_" (older projects: a long key starting with "eyJ").' };
}

// For messages: enough to recognise the key, nowhere near enough to use it.
export function describeServiceKey(key: string): string {
  return `${key.startsWith('sb_secret_') ? 'sb_secret_' : 'eyJ'}…${key.slice(-4)}`;
}

const set = (v: string | undefined) => (v ?? '').trim().length > 0;

export function chooseBackend(env: Record<string, string | undefined>, cwd: string): BackendChoice {
  const hasUrl = set(env.SUPABASE_URL);
  const hasKey = set(env.SUPABASE_SERVICE_ROLE_KEY);

  if (hasUrl && hasKey) {
    const url = validateSupabaseUrl(env.SUPABASE_URL);
    const key = validateServiceKey(env.SUPABASE_SERVICE_ROLE_KEY);
    const problems = [...(url.ok ? [] : [url.problem]), ...(key.ok ? [] : [key.problem])];
    return url.ok && key.ok ? { kind: 'supabase', url: url.url, serviceKey: key.key } : { kind: 'error', problems };
  }

  if (hasUrl !== hasKey) {
    const missing = hasUrl ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_URL';
    return { kind: 'error', problems: [`${missing} is missing. Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use Supabase, or neither to use local files.`] };
  }

  if (env.VERCEL === '1') {
    return {
      kind: 'error',
      problems: ['This is a Vercel deployment but Supabase is not configured, so there is nowhere to keep stories. In Vercel, open Project Settings -> Environment Variables and add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'],
    };
  }
  if (env.REQUIRE_SUPABASE === '1') {
    return { kind: 'error', problems: ['REQUIRE_SUPABASE is set but SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not.'] };
  }

  return { kind: 'file', dir: env.STORIES_DIR || path.join(cwd, 'content', 'stories') };
}

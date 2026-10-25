'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LOCAL_CHANGE_EVENT, readLocalState, SYNCED_EVENT, writeLocalState } from '../../lib/accounts/local-state';
import { mergeReaderStates } from '../../lib/accounts/reader-state';
import { buildGoogleSignInUrl, clearSession, loadSession, needsRefresh, parseAuthRedirect, refreshSession, requestMagicLink, saveSession, Session } from '../../lib/accounts/session';
import { localDateString } from '../../lib/habit/activity-log';

export type ReaderStatus = 'loading' | 'disabled' | 'signed-out' | 'signed-in';
export type SyncState = 'idle' | 'syncing' | 'saved' | 'error';

interface ReaderContextValue {
  status: ReaderStatus;
  // Whether to offer the Google button (only once Google is set up).
  google: boolean;
  email: string | null;
  // A kind message about the last sign-in attempt (for example "that link has expired"), or null.
  message: string | null;
  sync: SyncState;
  signInWithGoogle(): void;
  sendLink(email: string): Promise<{ ok: true } | { ok: false; message: string }>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
}

const OFF: ReaderContextValue = {
  status: 'disabled',
  google: false,
  email: null,
  message: null,
  sync: 'idle',
  signInWithGoogle() {},
  sendLink: async () => ({ ok: false, message: 'Sign-in is not switched on.' }),
  signOut: async () => {},
  syncNow: async () => {},
};

const ReaderContext = createContext<ReaderContextValue>(OFF);
export const useReader = () => useContext(ReaderContext);

const nowSeconds = () => Math.floor(Date.now() / 1000);

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface AuthSettings {
  url: string;
  publishableKey: string;
}

// Knows whether the reader is signed in, keeps the session fresh, and keeps this browser and the saved copy in step.
// Without sign-in switched on (or without a signed-in reader) the app works exactly as it did, from browser storage.
export default function ReaderProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ReaderStatus>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>('idle');
  const [google, setGoogle] = useState(false);

  const settings = useRef<AuthSettings | null>(null);
  const session = useRef<Session | null>(null);
  const statusRef = useRef<ReaderStatus>('loading');
  const syncing = useRef(false);
  const syncAgain = useRef(false);

  const setStatusBoth = useCallback((next: ReaderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const dropSession = useCallback(() => {
    clearSession(browserStorage());
    session.current = null;
    setEmail(null);
    setStatusBoth('signed-out');
    setSync('idle');
  }, [setStatusBoth]);

  // Returns a session whose token is still good, renewing it first if it is about to run out.
  const freshSession = useCallback(async (): Promise<Session | null> => {
    const current = session.current;
    if (!current) return null;
    if (!needsRefresh(current, nowSeconds()) || !settings.current) return current;

    const renewed = await refreshSession({ ...settings.current, refreshToken: current.refreshToken, now: nowSeconds() });
    if (renewed.ok) {
      session.current = renewed.session;
      saveSession(browserStorage(), renewed.session);
      return renewed.session;
    }
    if (renewed.signedOut) {
      dropSession();
      return null;
    }
    return current; // an outage: carry on with what we have
  }, [dropSession]);

  const syncNow = useCallback(async (): Promise<void> => {
    if (syncing.current) {
      syncAgain.current = true;
      return;
    }
    syncing.current = true;
    setSync('syncing');
    try {
      const s = await freshSession();
      if (!s) return;
      const headers = { Authorization: `Bearer ${s.accessToken}` };

      const got = await fetch('/api/reader/state', { headers, cache: 'no-store' });
      if (got.status === 401) {
        dropSession();
        return;
      }
      if (!got.ok) throw new Error('read failed');
      const { state: saved } = await got.json();

      const storage = browserStorage();
      const today = localDateString();
      const before = JSON.stringify(readLocalState(storage));
      const merged = mergeReaderStates(saved, readLocalState(storage), today);
      writeLocalState(storage, merged);
      if (JSON.stringify(readLocalState(storage)) !== before) window.dispatchEvent(new Event(SYNCED_EVENT));

      const put = await fetch('/api/reader/state', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(merged) });
      if (!put.ok) throw new Error('save failed');
      setSync('saved');
    } catch {
      setSync('error');
    } finally {
      syncing.current = false;
      if (syncAgain.current) {
        syncAgain.current = false;
        void syncNow();
      }
    }
  }, [dropSession, freshSession]);

  // Start-up: is sign-in switched on, did the reader just come back from a sign-in link, is there a saved session?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let found: AuthSettings | null = null;
      let googleOn = false;
      try {
        const res = await fetch('/api/auth/config', { cache: 'no-store' });
        const body = await res.json();
        if (body?.enabled === true && typeof body.url === 'string' && typeof body.publishableKey === 'string') {
          found = { url: body.url, publishableKey: body.publishableKey };
          googleOn = body.google === true;
        }
      } catch {
        // Treated as "not switched on"; the app still works.
      }
      if (cancelled) return;
      if (!found) {
        setStatusBoth('disabled');
        return;
      }
      settings.current = found;
      setGoogle(googleOn);

      const storage = browserStorage();
      const back = parseAuthRedirect(window.location.hash, nowSeconds());
      if (back) {
        // Take the tokens out of the address bar straight away.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if (back.ok) saveSession(storage, back.session);
        else setMessage(back.message);
      }

      const stored = loadSession(storage);
      if (!stored) {
        setStatusBoth('signed-out');
        return;
      }
      session.current = stored;
      setEmail(stored.email);
      setStatusBoth('signed-in');
      void syncNow();
    })();
    return () => {
      cancelled = true;
    };
  }, [setStatusBoth, syncNow]);

  // Keep the session fresh while the page is open, and save changes a moment after they happen.
  useEffect(() => {
    const renew = setInterval(() => {
      if (statusRef.current === 'signed-in') void freshSession();
    }, 60000);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (statusRef.current !== 'signed-in') return;
      clearTimeout(pending);
      pending = setTimeout(() => void syncNow(), 1500);
    };
    window.addEventListener(LOCAL_CHANGE_EVENT, onChange);
    return () => {
      clearInterval(renew);
      clearTimeout(pending);
      window.removeEventListener(LOCAL_CHANGE_EVENT, onChange);
    };
  }, [freshSession, syncNow]);

  const signInWithGoogle = useCallback(() => {
    if (!settings.current) return;
    window.location.assign(buildGoogleSignInUrl(settings.current.url, `${window.location.origin}/account`));
  }, []);

  const sendLink = useCallback(async (address: string) => {
    if (!settings.current) return { ok: false as const, message: 'Sign-in is not switched on.' };
    return requestMagicLink({ ...settings.current, email: address, redirectTo: `${window.location.origin}/account` });
  }, []);

  const signOut = useCallback(async () => {
    const current = session.current;
    const cfg = settings.current;
    dropSession();
    if (current && cfg) {
      // Best effort: ends the session on Supabase's side too. The reader is signed out here either way.
      try {
        await fetch(`${cfg.url.replace(/\/+$/, '')}/auth/v1/logout`, { method: 'POST', headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${current.accessToken}` } });
      } catch {
        // ignored on purpose
      }
    }
  }, [dropSession]);

  return <ReaderContext.Provider value={{ status, google, email, message, sync, signInWithGoogle, sendLink, signOut, syncNow }}>{children}</ReaderContext.Provider>;
}

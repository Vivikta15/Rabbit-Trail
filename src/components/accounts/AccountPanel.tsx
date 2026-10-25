'use client';

import { useState } from 'react';
import { useReader } from './ReaderProvider';

const SYNC_TEXT = { idle: '', syncing: 'Saving your trail…', saved: 'Your trail is saved.', error: 'Could not save just now. We will try again.' } as const;

export default function AccountPanel() {
  const { status, google, email, message, sync, signInWithGoogle, sendLink, signOut } = useReader();
  const [address, setAddress] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (status === 'loading') return <p className="text-slate-400">One moment…</p>;

  if (status === 'disabled') {
    return (
      <p className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-300">
        Saving your trail across devices isn&apos;t switched on here yet. Your streak and stories are still kept on this device.
      </p>
    );
  }

  if (status === 'signed-in') {
    return (
      <section aria-label="Your account" className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="text-slate-300">
          Signed in as <strong className="text-slate-100">{email ?? 'your account'}</strong>
        </p>
        <p role="status" className="text-sm text-slate-400">
          {SYNC_TEXT[sync]}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-slate-600 px-4 py-2 text-slate-200 hover:border-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          Sign out
        </button>
      </section>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setResult(null);
    const out = await sendLink(address);
    setSending(false);
    setResult(out.ok ? { ok: true, text: 'Check your email for a sign-in link. You can close this tab.' } : { ok: false, text: out.message });
  }

  return (
    <section aria-label="Sign in" className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      {message && (
        <p role="alert" className="rounded-lg bg-slate-800 p-3 text-amber-200">
          {message}
        </p>
      )}
      <p className="text-slate-300">Sign in to keep your trail and streak safe, and to pick up where you left off on any device. What you have read on this device is kept.</p>

      {google && (
        <button
          type="button"
          onClick={signInWithGoogle}
          className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-slate-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Continue with Google
        </button>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="email" className="block text-sm text-slate-300">
          {google ? 'Or get a sign-in link by email' : 'Get a sign-in link by email'}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-lg border border-slate-600 px-4 py-2 text-slate-100 hover:border-amber-300 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {sending ? 'Sending…' : 'Email me a link'}
        </button>
        {result && (
          <p role="status" className={result.ok ? 'text-emerald-300' : 'text-amber-200'}>
            {result.text}
          </p>
        )}
      </form>
    </section>
  );
}

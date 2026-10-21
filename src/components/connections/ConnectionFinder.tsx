'use client';

import { FormEvent, useState } from 'react';
import { Search } from 'lucide-react';
import type { ConnectionResult } from '../../lib/graph/pathfinder';
import PathGraphView from './PathGraphView';

export default function ConnectionFinder({ suggestions }: { suggestions: string[] }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find(first: string, second: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections?a=${encodeURIComponent(first)}&b=${encodeURIComponent(second)}`);
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch {
      setResult(null);
      setError('Could not search for a connection. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    find(a, b);
  }

  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';

  return (
    <section className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">First concept</span>
            <input list="concept-suggestions" value={a} onChange={(e) => setA(e.target.value)} required placeholder="cheese" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Second concept</span>
            <input list="concept-suggestions" value={b} onChange={(e) => setB(e.target.value)} required placeholder="moon" className={inputClass} />
          </label>
        </div>
        <datalist id="concept-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Search size={16} aria-hidden />
          {loading ? 'Searching…' : 'Find the connection'}
        </button>
      </form>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {result?.status === 'path' && <PathGraphView trail={result.trail} />}

        {result?.status === 'unconnected' && (
          <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900 p-5">
            <h3 className="mb-2 font-semibold">No verified path yet</h3>
            <p className="text-slate-300">{result.narrative}</p>
          </div>
        )}

        {result?.status === 'unknown' && (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h3 className="mb-2 font-semibold">We don&apos;t have {result.unknownTerms.map((t) => `“${t}”`).join(' or ')} mapped yet</h3>
            <p className="mb-3 text-sm text-slate-400">Try one of these concepts:</p>
            <ul className="flex flex-wrap gap-2">
              {result.suggestions.map((s) => (
                <li key={s} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

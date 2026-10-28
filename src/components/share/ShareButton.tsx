'use client';

import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';
import { trackEvent } from '../../hooks/use-track';
import { shareUrl } from '../../lib/share/share';

// Shares a page of this site with the phone's own share sheet where there is one, and copies the link otherwise.
// Every shared link is tagged ?utm_source=share, so a visit that came from a friend can be told apart.
export default function ShareButton({ path, text, label, className }: { path: string; text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = shareUrl(window.location.origin, path, 'share');
    trackEvent('shared');

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // the reader closed the sheet: that is their choice
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={className ?? 'inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700'}
    >
      {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
      {copied ? 'Link copied' : label}
    </button>
  );
}

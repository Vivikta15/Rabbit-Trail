import { Check } from 'lucide-react';
import { PRICE_PER_MONTH } from '../../lib/subscription/trial-manager';

export default function PricingCard({ onSubscribe }: { onSubscribe: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-400/60 bg-slate-900 p-6">
      <p className="text-4xl font-bold">
        Rs {PRICE_PER_MONTH}
        <span className="text-base font-normal text-slate-400"> / month</span>
      </p>
      <ul className="mt-4 space-y-2 text-sm text-slate-300">
        {['A new sourced story every day', 'Stories written in your curiosity style', 'The full Connection Finder', 'Your trail and streak, always yours'].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSubscribe}
        autoFocus
        className="mt-6 w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-cream hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
      >
        Subscribe
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">Test billing: no real payment is taken.</p>
    </div>
  );
}

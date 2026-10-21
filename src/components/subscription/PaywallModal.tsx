import Link from 'next/link';
import PricingCard from './PricingCard';

export default function PaywallModal({ onSubscribe }: { onSubscribe: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/90 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="paywall-title" className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h2 id="paywall-title" className="text-2xl font-bold">
            Your free week is up
          </h2>
          <p className="mt-2 text-slate-300">
            We hope the trail has been worth following. Everything you&apos;ve already read and your streak are still here.
          </p>
        </div>
        <PricingCard onSubscribe={onSubscribe} />
        <p className="text-center text-sm">
          <Link href="/dashboard" className="text-slate-400 underline hover:text-slate-200">
            Maybe later, take me to my trail
          </Link>
        </p>
      </div>
    </div>
  );
}

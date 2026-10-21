'use client';

import { useActivityLog } from '../../hooks/use-activity-log';
import { useSubscription } from '../../hooks/use-subscription';
import { hasAccess } from '../../lib/subscription/trial-manager';
import PaywallModal from './PaywallModal';

type Props =
  | { feature: 'story'; storyId: string; children: React.ReactNode }
  | { feature: 'connections'; storyId?: undefined; children: React.ReactNode };

export default function AccessGate({ feature, storyId, children }: Props) {
  const { state, status, subscribe } = useSubscription();
  const { log } = useActivityLog();

  if (!state || !status || !log) {
    return <p className="px-4 py-8 text-center text-slate-400">Loading…</p>;
  }

  const alreadyRead = log.some((e) => e.type === 'story' && e.storyId === storyId);
  if (!hasAccess(feature, status, { alreadyRead })) {
    return <PaywallModal onSubscribe={subscribe} />;
  }

  return (
    <>
      {!state.isSubscribed && status.isAccessAllowed && (
        <p className="mx-auto max-w-2xl px-4 pt-4 text-sm text-slate-400">
          Free trial · {status.daysRemainingInTrial} {status.daysRemainingInTrial === 1 ? 'day' : 'days'} left
        </p>
      )}
      {!state.isSubscribed && status.isTrialExpired && (
        <p className="mx-auto max-w-2xl px-4 pt-4 text-sm text-slate-400">
          Your free trial has ended, but you can always revisit stories you&apos;ve read.{' '}
          <button type="button" onClick={subscribe} className="underline hover:text-slate-200">
            Subscribe for Rs 49/month
          </button>{' '}
          to unlock new ones.
        </p>
      )}
      {children}
    </>
  );
}

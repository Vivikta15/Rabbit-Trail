'use client';

import { useCallback, useEffect, useState } from 'react';
import { localDateString } from '../lib/habit/activity-log';
import { loadSubscription, markSubscribed, saveSubscription, startTrialIfNeeded } from '../lib/subscription/subscription-store';
import { checkTrialStatus, SubscriptionState } from '../lib/subscription/trial-manager';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Read-modify-write so the quiz and the gates never overwrite each other's state.
export function startTrial(): SubscriptionState {
  const storage = browserStorage();
  const next = startTrialIfNeeded(loadSubscription(storage), localDateString());
  saveSubscription(storage, next);
  return next;
}

// `state` is null until the browser has been read. A reader who skipped the quiz gets their
// trial started on first access, so skipping onboarding is not a way around the paywall.
export function useSubscription() {
  const [state, setState] = useState<SubscriptionState | null>(null);

  useEffect(() => {
    setState(startTrial());
  }, []);

  const subscribe = useCallback(() => {
    const storage = browserStorage();
    const next = markSubscribed(startTrialIfNeeded(loadSubscription(storage), localDateString()));
    saveSubscription(storage, next);
    setState(next);
  }, []);

  const status = state ? checkTrialStatus(state, localDateString()) : null;
  return { state, status, subscribe };
}

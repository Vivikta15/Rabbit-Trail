import { CURRENCY, PRICE_PER_MONTH, SubscriptionState } from './trial-manager';

export const SUBSCRIPTION_STORAGE_KEY = 'rabbit-trail:subscription:v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSubscription(storage: StorageLike | null): SubscriptionState | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(SUBSCRIPTION_STORAGE_KEY) ?? 'null');
    if (
      parsed &&
      typeof parsed.trialStartDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.trialStartDate) &&
      typeof parsed.isSubscribed === 'boolean'
    ) {
      return { trialStartDate: parsed.trialStartDate, isSubscribed: parsed.isSubscribed, pricePerMonth: PRICE_PER_MONTH, currency: CURRENCY };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSubscription(storage: StorageLike | null, state: SubscriptionState): void {
  if (!storage) return;
  try {
    storage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ trialStartDate: state.trialStartDate, isSubscribed: state.isSubscribed }));
  } catch {
    // Storage can be full or blocked; the trial just won't be remembered this session.
  }
}

export function startTrialIfNeeded(existing: SubscriptionState | null, today: string): SubscriptionState {
  return existing ?? { trialStartDate: today, isSubscribed: false, pricePerMonth: PRICE_PER_MONTH, currency: CURRENCY };
}

export function markSubscribed(state: SubscriptionState): SubscriptionState {
  return { ...state, isSubscribed: true };
}

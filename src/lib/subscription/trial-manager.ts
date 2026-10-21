export const TRIAL_LENGTH_DAYS = 7;
export const PRICE_PER_MONTH = '49';
export const CURRENCY = 'INR';

export interface SubscriptionState {
  trialStartDate: string; // ISO date 'YYYY-MM-DD'
  isSubscribed: boolean;
  pricePerMonth: string;
  currency: string;
}

export interface TrialStatus {
  isAccessAllowed: boolean;
  daysRemainingInTrial: number;
  isTrialExpired: boolean;
  shouldPromptPaywall: boolean;
}

// The start day is day 1, so the trial covers days 1-7 and day 8 is the first blocked day.
export function checkTrialStatus(
  state: SubscriptionState,
  referenceDateStr?: string
): TrialStatus {
  if (state.isSubscribed) {
    return {
      isAccessAllowed: true,
      daysRemainingInTrial: 0,
      isTrialExpired: false,
      shouldPromptPaywall: false
    };
  }

  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0];
  const msPerDay = 1000 * 60 * 60 * 24;
  const trialStartMs = new Date(state.trialStartDate).getTime();
  const todayMs = new Date(todayStr).getTime();

  const daysElapsed = Math.floor((todayMs - trialStartMs) / msPerDay);

  if (daysElapsed < TRIAL_LENGTH_DAYS) {
    return {
      isAccessAllowed: true,
      daysRemainingInTrial: TRIAL_LENGTH_DAYS - daysElapsed,
      isTrialExpired: false,
      shouldPromptPaywall: false
    };
  }

  return {
    isAccessAllowed: false,
    daysRemainingInTrial: 0,
    isTrialExpired: true,
    shouldPromptPaywall: true
  };
}

// An expired reader keeps their history: stories already read, the dashboard and the archetype
// card stay open. Only new stories and the Connection Finder need the trial or a subscription.
export function hasAccess(
  feature: 'story' | 'connections',
  status: TrialStatus,
  options: { alreadyRead?: boolean } = {}
): boolean {
  if (status.isAccessAllowed) return true;
  return feature === 'story' && options.alreadyRead === true;
}

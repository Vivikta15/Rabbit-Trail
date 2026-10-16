export interface SubscriptionState {
  trialStartDate: string; // ISO date 'YYYY-MM-DD'
  isSubscribed: boolean;
  pricePerMonth: string;
  currency: string;
}

export function checkTrialStatus(
  state: SubscriptionState,
  referenceDateStr?: string
): {
  isAccessAllowed: boolean;
  daysRemainingInTrial: number;
  isTrialExpired: boolean;
  shouldPromptPaywall: boolean;
} {
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
  const trialLimitDays = 7;
  const daysRemainingInTrial = Math.max(0, trialLimitDays - daysElapsed);

  if (daysElapsed <= trialLimitDays) {
    return {
      isAccessAllowed: true,
      daysRemainingInTrial,
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

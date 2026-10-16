function checkTrialStatus(state, referenceDateStr) {
  if (state.isSubscribed) {
    return { isAccessAllowed: true, daysRemainingInTrial: 0, isTrialExpired: false, shouldPromptPaywall: false };
  }
  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0];
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysElapsed = Math.floor((new Date(todayStr).getTime() - new Date(state.trialStartDate).getTime()) / msPerDay);
  const trialLimitDays = 7;
  const daysRemainingInTrial = Math.max(0, trialLimitDays - daysElapsed);

  if (daysElapsed <= trialLimitDays) {
    return { isAccessAllowed: true, daysRemainingInTrial, isTrialExpired: false, shouldPromptPaywall: false };
  }
  return { isAccessAllowed: false, daysRemainingInTrial: 0, isTrialExpired: true, shouldPromptPaywall: true };
}

module.exports = { checkTrialStatus };

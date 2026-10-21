const test = require('node:test');
const assert = require('node:assert/strict');

const { checkTrialStatus, hasAccess, PRICE_PER_MONTH } = require('../dist/lib/subscription/trial-manager.js');
const {
  SUBSCRIPTION_STORAGE_KEY,
  loadSubscription,
  saveSubscription,
  startTrialIfNeeded,
  markSubscribed,
} = require('../dist/lib/subscription/subscription-store.js');

const trial = (start, isSubscribed = false) => ({
  trialStartDate: start,
  isSubscribed,
  pricePerMonth: PRICE_PER_MONTH,
  currency: 'INR',
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

test('7-Day Trial - the start day is day 1 and day 8 is the first blocked day', () => {
  const day1 = checkTrialStatus(trial('2026-10-10'), '2026-10-10');
  assert.equal(day1.isAccessAllowed, true);
  assert.equal(day1.daysRemainingInTrial, 7);

  const day7 = checkTrialStatus(trial('2026-10-10'), '2026-10-16');
  assert.equal(day7.isAccessAllowed, true);
  assert.equal(day7.daysRemainingInTrial, 1);
  assert.equal(day7.shouldPromptPaywall, false);

  const day8 = checkTrialStatus(trial('2026-10-10'), '2026-10-17');
  assert.equal(day8.isAccessAllowed, false);
  assert.equal(day8.isTrialExpired, true);
  assert.equal(day8.shouldPromptPaywall, true);
  assert.equal(day8.daysRemainingInTrial, 0);
});

test('Subscription - a subscriber keeps access long after the trial', () => {
  const status = checkTrialStatus(trial('2026-01-01', true), '2026-10-17');

  assert.equal(status.isAccessAllowed, true);
  assert.equal(status.shouldPromptPaywall, false);
});

test('Pricing - the micro-subscription is Rs 49 a month', () => {
  assert.equal(PRICE_PER_MONTH, '49');
});

test('Active Trial - day 3 user reaches new stories and the connection finder', () => {
  const status = checkTrialStatus(trial('2026-10-10'), '2026-10-12');

  assert.equal(hasAccess('story', status, { alreadyRead: false }), true);
  assert.equal(hasAccess('connections', status), true);
});

test('Expired Trial - day 8 user is stopped at a new story and the connection finder', () => {
  const status = checkTrialStatus(trial('2026-10-10'), '2026-10-17');

  assert.equal(hasAccess('story', status, { alreadyRead: false }), false);
  assert.equal(hasAccess('connections', status), false);
});

test('Archival Access - expired user can still reopen a story they already read', () => {
  const status = checkTrialStatus(trial('2026-10-10'), '2026-10-17');

  assert.equal(hasAccess('story', status, { alreadyRead: true }), true);
});

test('Subscription store - starting the trial never overwrites an existing start date', () => {
  const first = startTrialIfNeeded(null, '2026-10-10');
  assert.equal(first.trialStartDate, '2026-10-10');
  assert.equal(first.isSubscribed, false);

  const again = startTrialIfNeeded(first, '2026-10-15');
  assert.equal(again.trialStartDate, '2026-10-10');
});

test('Subscription store - subscribing keeps the trial start date', () => {
  const subscribed = markSubscribed(startTrialIfNeeded(null, '2026-10-10'));

  assert.equal(subscribed.isSubscribed, true);
  assert.equal(subscribed.trialStartDate, '2026-10-10');
});

test('Subscription store - round-trips through storage and rejects corrupted data', () => {
  const storage = fakeStorage();
  const state = startTrialIfNeeded(null, '2026-10-10');

  saveSubscription(storage, state);
  assert.deepEqual(loadSubscription(storage), state);

  assert.equal(loadSubscription(fakeStorage({ [SUBSCRIPTION_STORAGE_KEY]: '{oops' })), null);
  assert.equal(loadSubscription(fakeStorage({ [SUBSCRIPTION_STORAGE_KEY]: '[]' })), null);
  assert.equal(loadSubscription(fakeStorage({ [SUBSCRIPTION_STORAGE_KEY]: JSON.stringify({ trialStartDate: 'soon', isSubscribed: false }) })), null);
  assert.equal(loadSubscription(null), null);
});

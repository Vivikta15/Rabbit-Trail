const test = require('node:test');
const assert = require('node:assert/strict');

const { readLocalState, writeLocalState, LOCAL_CHANGE_EVENT } = require('../dist/lib/accounts/local-state.js');
const { saveActivity, loadActivity } = require('../dist/lib/habit/activity-log.js');
const { saveSubscription, loadSubscription } = require('../dist/lib/subscription/subscription-store.js');
const { saveProfileArchetype, loadProfileArchetype } = require('../dist/lib/profile/profile-store.js');

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};
const story = (date, storyId) => ({ type: 'story', date, storyId, topic: 'T', era: 'E', readCounterArgument: false });
const sub = (trialStartDate, isSubscribed = false) => ({ trialStartDate, isSubscribed, pricePerMonth: 49, currency: 'INR' });

test('Local state - an untouched browser reads as empty', () => {
  assert.deepEqual(readLocalState(memory()), { archetype: null, trialStartDate: null, activity: [] });
  assert.deepEqual(readLocalState(null), { archetype: null, trialStartDate: null, activity: [] });
});

test('Local state - reads the history, reading style and trial start this browser holds', () => {
  const s = memory();
  saveActivity(s, [story('2026-10-20', 'a')]);
  saveProfileArchetype(s, 'magpie');
  saveSubscription(s, sub('2026-10-18'));

  assert.deepEqual(readLocalState(s), { archetype: 'magpie', trialStartDate: '2026-10-18', activity: [story('2026-10-20', 'a')] });
});

test('Local state - writing a merged copy updates all three, and reading it back gives the same', () => {
  const s = memory();
  const merged = { archetype: 'detective', trialStartDate: '2026-10-10', activity: [story('2026-10-20', 'a'), story('2026-10-21', 'b')] };

  writeLocalState(s, merged);

  assert.deepEqual(loadActivity(s), merged.activity);
  assert.equal(loadProfileArchetype(s), 'detective');
  assert.equal(loadSubscription(s).trialStartDate, '2026-10-10');
});

test('Local state - the trial start only ever moves earlier here, and a local "subscribed" flag is left alone', () => {
  const s = memory();
  saveSubscription(s, sub('2026-10-15', true));

  writeLocalState(s, { archetype: null, trialStartDate: '2026-10-22', activity: [] });
  assert.equal(loadSubscription(s).trialStartDate, '2026-10-15', 'a later saved date does not extend a trial');
  assert.equal(loadSubscription(s).isSubscribed, true);

  writeLocalState(s, { archetype: null, trialStartDate: '2026-10-01', activity: [] });
  assert.equal(loadSubscription(s).trialStartDate, '2026-10-01');
});

test('Local state - an empty saved copy never erases what this browser has', () => {
  const s = memory();
  saveActivity(s, [story('2026-10-20', 'a')]);
  saveProfileArchetype(s, 'magpie');

  writeLocalState(s, { archetype: null, trialStartDate: null, activity: [] });

  assert.deepEqual(loadActivity(s), [story('2026-10-20', 'a')]);
  assert.equal(loadProfileArchetype(s), 'magpie');
});

test('Local state - the change event has a name the rest of the app can share', () => {
  assert.equal(typeof LOCAL_CHANGE_EVENT, 'string');
});

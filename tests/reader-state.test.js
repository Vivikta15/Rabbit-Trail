const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanReaderState, mergeReaderStates, emptyReaderState, MAX_ACTIVITY } = require('../dist/lib/accounts/reader-state.js');

const TODAY = '2026-10-24';
const story = (date, storyId, readCounterArgument = false) => ({ type: 'story', date, storyId, topic: 'Topic', era: 'Era', readCounterArgument });
const state = (over = {}) => ({ archetype: null, trialStartDate: null, activity: [], ...over });

// ---- cleaning what a browser sends ------------------------------------------------------------------------------------

test('Clean - anything that is not a reader state becomes an empty one', () => {
  for (const junk of [null, undefined, 'x', 42, [], true]) assert.deepEqual(cleanReaderState(junk, TODAY), emptyReaderState());
});

test('Clean - invalid entries, unknown reading styles and extra fields are dropped', () => {
  const out = cleanReaderState(
    { archetype: 'wizard', trialStartDate: '2026-10-01', isSubscribed: true, subscribed: true, activity: [story('2026-10-20', 'a'), { type: 'story' }, 'junk', { type: 'nope', date: '2026-10-20' }] },
    TODAY,
  );

  assert.equal(out.archetype, null);
  assert.deepEqual(out.activity, [story('2026-10-20', 'a')]);
  assert.deepEqual(Object.keys(out).sort(), ['activity', 'archetype', 'trialStartDate'], 'a browser can never claim to have paid');
});

test('Clean - a known reading style is kept', () => {
  assert.equal(cleanReaderState({ archetype: 'detective' }, TODAY).archetype, 'detective');
});

test('Clean - entries dated in the future are dropped, so a streak cannot be built in advance (tomorrow is allowed for time zones)', () => {
  const out = cleanReaderState({ activity: [story('2026-10-24', 'today'), story('2026-10-25', 'tomorrow'), story('2026-10-26', 'later'), story('2999-01-01', 'far')] }, TODAY);

  assert.deepEqual(out.activity.map((e) => e.storyId), ['today', 'tomorrow']);
});

test('Clean - dates must be real calendar days', () => {
  const out = cleanReaderState({ trialStartDate: '2026-13-45', activity: [story('2026-02-30', 'x'), story('not a date', 'y'), story('2026-10-20', 'ok')] }, TODAY);

  assert.equal(out.trialStartDate, null);
  assert.deepEqual(out.activity.map((e) => e.storyId), ['ok']);
});

test('Clean - a trial start in the future is moved back to today', () => {
  assert.equal(cleanReaderState({ trialStartDate: '2027-01-01' }, TODAY).trialStartDate, TODAY);
  assert.equal(cleanReaderState({ trialStartDate: '2026-10-01' }, TODAY).trialStartDate, '2026-10-01');
});

test('Clean - repeated entries count once', () => {
  const out = cleanReaderState({ activity: [story('2026-10-20', 'a'), story('2026-10-20', 'a')] }, TODAY);

  assert.equal(out.activity.length, 1);
});

test('Clean - an oversized history keeps the newest entries', () => {
  const many = Array.from({ length: MAX_ACTIVITY + 50 }, (_, i) => story(new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), `s${i}`));
  const out = cleanReaderState({ activity: many }, '2040-01-01');

  assert.equal(out.activity.length, MAX_ACTIVITY);
  assert.equal(out.activity[out.activity.length - 1].storyId, `s${MAX_ACTIVITY + 49}`);
  assert.equal(out.activity.some((e) => e.storyId === 's0'), false, 'the oldest were dropped');
});

// ---- merging a browser with the saved copy ----------------------------------------------------------------------------

test('Merge - both histories are kept, with repeats counted once', () => {
  const saved = state({ activity: [story('2026-10-20', 'a'), story('2026-10-21', 'b')] });
  const browser = state({ activity: [story('2026-10-21', 'b'), story('2026-10-22', 'c')] });

  const merged = mergeReaderStates(saved, browser, TODAY);

  assert.deepEqual(merged.activity.map((e) => e.storyId).sort(), ['a', 'b', 'c']);
});

test('Merge - reading the counter-argument on one device counts on both', () => {
  const merged = mergeReaderStates(state({ activity: [story('2026-10-20', 'a', false)] }), state({ activity: [story('2026-10-20', 'a', true)] }), TODAY);

  assert.equal(merged.activity.length, 1);
  assert.equal(merged.activity[0].readCounterArgument, true);
});

test('Merge - the earliest trial start wins and can never be moved later', () => {
  assert.equal(mergeReaderStates(state({ trialStartDate: '2026-10-01' }), state({ trialStartDate: '2026-10-20' }), TODAY).trialStartDate, '2026-10-01');
  assert.equal(mergeReaderStates(state({ trialStartDate: '2026-10-20' }), state({ trialStartDate: '2026-10-01' }), TODAY).trialStartDate, '2026-10-01');
  assert.equal(mergeReaderStates(state({ trialStartDate: null }), state({ trialStartDate: '2026-10-20' }), TODAY).trialStartDate, '2026-10-20');
  assert.equal(mergeReaderStates(state({ trialStartDate: '2026-10-01' }), state({ trialStartDate: null }), TODAY).trialStartDate, '2026-10-01');
});

test('Merge - the reading style the reader just chose wins, and an empty one never erases a saved one', () => {
  assert.equal(mergeReaderStates(state({ archetype: 'detective' }), state({ archetype: 'magpie' }), TODAY).archetype, 'magpie');
  assert.equal(mergeReaderStates(state({ archetype: 'detective' }), state({ archetype: null }), TODAY).archetype, 'detective');
});

test('Merge - doing it twice, or in either order, gives the same history', () => {
  const a = state({ activity: [story('2026-10-20', 'a'), story('2026-10-21', 'b')] });
  const b = state({ activity: [story('2026-10-21', 'b'), story('2026-10-22', 'c')] });
  const ids = (s) => s.activity.map((e) => e.storyId).sort();

  const once = mergeReaderStates(a, b, TODAY);
  assert.deepEqual(ids(mergeReaderStates(once, b, TODAY)), ids(once), 'repeating a sync changes nothing');
  assert.deepEqual(ids(mergeReaderStates(b, a, TODAY)), ids(once), 'the order does not matter');
});

test('Merge - future-dated entries from the browser never get in, even if the saved copy is empty', () => {
  const merged = mergeReaderStates(emptyReaderState(), state({ activity: [story('2026-12-01', 'future'), story('2026-10-22', 'ok')] }), TODAY);

  assert.deepEqual(merged.activity.map((e) => e.storyId), ['ok']);
});

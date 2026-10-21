const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateStreak, curiosityRadius } = require('../dist/lib/habit/streak-calculator.js');
const {
  appendEntry,
  loadActivity,
  saveActivity,
  summarizeActivity,
  localDateString,
} = require('../dist/lib/habit/activity-log.js');

const story = (date, storyId, readCounterArgument) => ({
  type: 'story',
  date,
  storyId,
  topic: 'Maritime Governance',
  era: '16th century',
  readCounterArgument,
});

const connection = (date, conceptA, conceptB, hops, domains) => ({
  type: 'connection',
  date,
  conceptA,
  conceptB,
  hops,
  domains,
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    data,
  };
}

test('Paused Streak - read Day 1, miss Day 2, read Day 3 counts 2, not 1', () => {
  const result = calculateStreak(['2026-10-01', '2026-10-03'], '2026-10-03');

  assert.equal(result.streakDays, 2);
  assert.equal(result.isPaused, false);
});

test('Paused Streak - a long gap pauses and keeps the count', () => {
  const result = calculateStreak(['2026-10-01', '2026-10-02'], '2026-10-20');

  assert.equal(result.streakDays, 2);
  assert.equal(result.isPaused, true);
});

test('Metrics Accuracy - counter-argument ratio, radius, longest hole and favorites', () => {
  const log = [
    story('2026-10-01', 'a', true),
    story('2026-10-02', 'b', false),
    connection('2026-10-02', 'Cheese', 'The Moon', 2, ['Food & Fermentation', 'Mythology & Literature']),
    connection('2026-10-03', 'Cheese', 'Fermentation & Preservation', 4, ['Food & Fermentation']),
    { type: 'favorite', date: '2026-10-03', conceptA: 'Cheese', conceptB: 'The Moon' },
    { type: 'favorite', date: '2026-10-04', conceptA: 'Cheese', conceptB: 'The Moon' },
  ];
  const summary = summarizeActivity(log, '2026-10-04');

  assert.equal(summary.storiesRead, 2);
  assert.equal(summary.counterArgumentReads, 1);
  assert.equal(summary.counterArgumentRatio, 0.5);
  assert.equal(summary.longestRabbitHole, 4);
  assert.equal(summary.curiosityRadius, curiosityRadius(2, 1));
  assert.equal(curiosityRadius(2, 1), 28);
  assert.deepEqual(summary.favoriteConnections, [{ conceptA: 'Cheese', conceptB: 'The Moon' }]);
  assert.equal(summary.streak.streakDays, 2);
});

test('Metrics Accuracy - empty log yields zeroed metrics', () => {
  const summary = summarizeActivity([], '2026-10-04');

  assert.equal(summary.storiesRead, 0);
  assert.equal(summary.counterArgumentRatio, 0);
  assert.equal(summary.longestRabbitHole, 0);
  assert.equal(summary.curiosityRadius, 0);
  assert.deepEqual(summary.trail, []);
});

test('Trail Map - topics, eras and domains appear once, in first-visited order', () => {
  const log = [
    connection('2026-10-01', 'Cheese', 'The Moon', 2, ['Food & Fermentation', 'Astronomy']),
    story('2026-10-02', 'a', true),
    connection('2026-10-03', 'Cheese', 'Silica Sand', 3, ['Astronomy', 'Geology']),
  ];
  const trail = summarizeActivity(log, '2026-10-03').trail;

  assert.deepEqual(
    trail.map((n) => n.label),
    ['Food & Fermentation', 'Astronomy', 'Maritime Governance', 'Geology'],
  );
  const storyNode = trail.find((n) => n.label === 'Maritime Governance');
  assert.equal(storyNode.kind, 'story');
  assert.equal(storyNode.era, '16th century');
});

test('Activity Log - the same story on the same day is logged once', () => {
  let log = [];
  log = appendEntry(log, story('2026-10-01', 'a', false));
  log = appendEntry(log, story('2026-10-01', 'a', true));
  log = appendEntry(log, story('2026-10-02', 'a', true));

  assert.equal(log.length, 2);
  assert.equal(log[0].readCounterArgument, true, 'counter-argument read should be upgraded, not lost');
});

test('Activity Log - round-trips through storage and survives corrupted data', () => {
  const storage = fakeStorage();
  const log = [story('2026-10-01', 'a', true)];

  saveActivity(storage, log);
  assert.deepEqual(loadActivity(storage), log);

  assert.deepEqual(loadActivity(fakeStorage({ 'rabbit-trail:activity:v1': '{not json' })), []);
  assert.deepEqual(loadActivity(fakeStorage({ 'rabbit-trail:activity:v1': '{"a":1}' })), []);
  assert.deepEqual(
    loadActivity(fakeStorage({ 'rabbit-trail:activity:v1': JSON.stringify([{ type: 'story' }, log[0]]) })),
    [log[0]],
  );
  assert.deepEqual(loadActivity(null), []);
});

test('Local date - uses the local calendar day, not UTC', () => {
  assert.equal(localDateString(new Date(2026, 9, 16, 23, 30)), '2026-10-16');
  assert.equal(localDateString(new Date(2026, 0, 5, 0, 10)), '2026-01-05');
});

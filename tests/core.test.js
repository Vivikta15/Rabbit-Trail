const test = require('node:test');
const assert = require('node:assert/strict');

// Mock calculations directly for Node's built-in test runner
test('Archetype Evaluation - deterministic mapping', () => {
  const { calculateArchetype } = require('../dist/data/quiz-questions.js');
  
  // Select option index 0 for all questions: yields 'detective' (8 pts)
  const result = calculateArchetype([0, 0, 0, 0, 0, 0]);
  assert.equal(result.topArchetype, 'detective');
  assert.ok(result.scores.detective > 0);
});

test('Anti-guilt Streak - never resets to 0 on missed days', () => {
  const { calculateStreak } = require('../dist/lib/habit/streak-calculator.js');

  // User read on 2026-10-01, then skipped 10 days, reading again on 2026-10-12
  const readDates = ['2026-10-01', '2026-10-02', '2026-10-03'];
  const today = '2026-10-16'; // 13 days later

  const result = calculateStreak(readDates, today);
  
  // Strict assertion: streak must NOT be 0 or 1, but preserved at 3 (paused)
  assert.equal(result.streakDays, 3);
  assert.equal(result.isPaused, true);
  assert.match(result.statusMessage, /Streak Paused/);
});

test('Connection Finder - finds shortest path between cheese and moon', () => {
  const { findConnectionPath } = require('../dist/lib/graph/pathfinder.js');

  const trail = findConnectionPath('cheese', 'moon');
  assert.ok(trail !== null, 'Trail should not be null');
  assert.equal(trail.conceptA, 'Cheese');
  assert.equal(trail.conceptB, 'The Moon');
  assert.ok(trail.hopsCount > 0);
  assert.ok(trail.nodes.length >= 2);
  assert.ok(trail.steps.length >= 1);
});

test('7-Day Trial - allows access within 7 days, prompts paywall after', () => {
  const { checkTrialStatus } = require('../dist/lib/subscription/trial-manager.js');

  // Day 3: Allowed
  const activeTrial = checkTrialStatus({
    trialStartDate: '2026-10-10',
    isSubscribed: false,
    pricePerMonth: '49',
    currency: 'INR'
  }, '2026-10-13');
  assert.equal(activeTrial.isAccessAllowed, true);
  assert.equal(activeTrial.shouldPromptPaywall, false);

  // Day 10: Blocked / Prompts Rs 49
  const expiredTrial = checkTrialStatus({
    trialStartDate: '2026-10-01',
    isSubscribed: false,
    pricePerMonth: '49',
    currency: 'INR'
  }, '2026-10-16');
  assert.equal(expiredTrial.isAccessAllowed, false);
  assert.equal(expiredTrial.shouldPromptPaywall, true);
  assert.equal(expiredTrial.isTrialExpired, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { streakMood, moodForPath, softenMood, mascotLine, parseCalmSetting, MOODS } = require('../dist/lib/mascot/mood.js');

const TODAY = '2026-10-23';
const daysAgo = (n) => {
  const d = new Date(Date.UTC(2026, 9, 23 - n));
  return d.toISOString().slice(0, 10);
};
const run = (from, to) => Array.from({ length: from - to + 1 }, (_, i) => daysAgo(from - i));

// ---- the streak mood -----------------------------------------------------------------------------------------------

test('Mood - a reader with no reading yet gets a curious rabbit, not a judgement', () => {
  assert.equal(streakMood({ readingDates: [], today: TODAY }), 'curious');
});

test('Mood - reading every day is thrilled, whether or not today has been read yet', () => {
  assert.equal(streakMood({ readingDates: run(6, 0), today: TODAY }), 'thrilled');
  assert.equal(streakMood({ readingDates: run(7, 1), today: TODAY }), 'thrilled', 'today is not a miss until it is over');
});

test('Mood - days before the first ever read are not misses', () => {
  assert.equal(streakMood({ readingDates: [TODAY], today: TODAY }), 'thrilled');
  assert.equal(streakMood({ readingDates: [daysAgo(2), daysAgo(1)], today: TODAY }), 'thrilled');
});

test('Mood - the number of missed days in the last week sets the mood', () => {
  const missing = (...gone) => run(8, 0).filter((d) => !gone.map(daysAgo).includes(d));

  assert.equal(streakMood({ readingDates: missing(3), today: TODAY }), 'happy', 'one miss');
  assert.equal(streakMood({ readingDates: missing(3, 5), today: TODAY }), 'hopeful', 'two misses');
  assert.equal(streakMood({ readingDates: missing(2, 3, 5), today: TODAY }), 'sad', 'three misses');
});

test('Mood - a shield covers a miss, so a shielded week is happy, not hopeful', () => {
  const dates = run(8, 0).filter((d) => d !== daysAgo(3));

  assert.equal(streakMood({ readingDates: dates, today: TODAY, shieldsUsed: 1 }), 'happy');
  assert.equal(streakMood({ readingDates: run(6, 0), today: TODAY, shieldsUsed: 1 }), 'happy', 'a shield used is never as bright as a flawless week');
  const twoMisses = run(8, 0).filter((d) => d !== daysAgo(3) && d !== daysAgo(5));
  assert.equal(streakMood({ readingDates: twoMisses, today: TODAY, shieldsUsed: 1 }), 'happy', 'one of two misses shielded leaves one');
});

test('Mood - a long absence is sad', () => {
  assert.equal(streakMood({ readingDates: [daysAgo(30)], today: TODAY }), 'sad');
  assert.equal(streakMood({ readingDates: [...run(30, 25)], today: TODAY }), 'sad');
});

test('Mood - future dates and repeats do not change the answer', () => {
  const base = run(6, 0);
  assert.equal(streakMood({ readingDates: [...base, ...base, '2026-12-01'], today: TODAY }), 'thrilled');
});

// ---- which page shows which rabbit ---------------------------------------------------------------------------------

test('Page - each page has its own rabbit scene, and the streak pages use the streak mood', () => {
  assert.equal(moodForPath('/story/story-battle-of-lepanto', 'sad'), 'reading');
  assert.equal(moodForPath('/connections', 'sad'), 'detective');
  assert.equal(moodForPath('/onboarding', 'sad'), 'curious');
  assert.equal(moodForPath('/dashboard', 'happy'), 'happy');
  assert.equal(moodForPath('/today', 'thrilled'), 'thrilled');
  assert.equal(moodForPath('/something-new', 'hopeful'), 'hopeful', 'an unknown page falls back to the streak mood');
  assert.equal(moodForPath('/', 'happy'), 'happy');
});

// ---- calm rabbit ---------------------------------------------------------------------------------------------------

test('Calm - removes the sad and angry faces and nothing else', () => {
  assert.equal(softenMood('sad', true), 'calm');
  assert.equal(softenMood('angry', true), 'calm');
  for (const m of MOODS.filter((m) => m !== 'sad' && m !== 'angry')) assert.equal(softenMood(m, true), m);
  for (const m of MOODS) assert.equal(softenMood(m, false), m, 'calm off changes nothing');
});

test('Calm - the stored setting is only on when it says so', () => {
  assert.equal(parseCalmSetting('true'), true);
  for (const bad of [null, undefined, '', 'false', 'yes', '1', '{}']) assert.equal(parseCalmSetting(bad), false);
});

// ---- what the rabbit says ------------------------------------------------------------------------------------------

test('Lines - every mood has a short line, and none of them shames the reader', () => {
  for (const m of MOODS) {
    const line = mascotLine(m);
    assert.ok(line.length > 3 && line.length <= 80, `${m}: a short line`);
    assert.equal(/fail|disappoint|lazy|shame|guilt|should have|give up|worthless/i.test(line), false, `${m}: "${line}" must not shame`);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { findConnectionPath, exploreConnection } = require('../dist/lib/graph/pathfinder.js');

test('Direct Path - cheese to moon is a cited chain', () => {
  const result = exploreConnection('cheese', 'moon');

  assert.equal(result.status, 'path');
  assert.equal(result.trail.conceptA, 'Cheese');
  assert.equal(result.trail.conceptB, 'The Moon');
  assert.equal(result.trail.hopsCount, result.trail.steps.length);
  assert.ok(result.trail.steps.length >= 1);
  assert.ok(result.trail.steps.every((s) => s.sourceCitation && s.historicalOrScientificBasis));
});

test('Concept lookup - accepts titles, case and spacing', () => {
  const result = exploreConnection('  the MOON ', 'Cheese');

  assert.equal(result.status, 'path');
  assert.equal(result.trail.conceptA, 'The Moon');
  assert.equal(result.trail.conceptB, 'Cheese');
});

test('Adjacent concepts - return a single hop relationship', () => {
  const trail = findConnectionPath('cheese', 'fermentation');

  assert.equal(trail.hopsCount, 1);
  assert.equal(trail.steps.length, 1);
  assert.equal(trail.steps[0].from, 'Cheese');
  assert.equal(trail.steps[0].to, 'Fermentation & Preservation');
});

test('Identical concepts - zero hops, no steps', () => {
  const result = exploreConnection('moon', 'The Moon');

  assert.equal(result.status, 'path');
  assert.equal(result.trail.hopsCount, 0);
  assert.deepEqual(result.trail.steps, []);
});

test('Unconnected concepts - fallback bridge is flagged unverified and names both sides', () => {
  const result = exploreConnection('silicon', 'moon');

  assert.equal(result.status, 'unconnected');
  assert.equal(result.verified, false);
  assert.match(result.narrative, /Silicon & Semiconductors/);
  assert.match(result.narrative, /The Moon/);
  assert.match(result.narrative, /Silica Sand/, 'should point at the nearest documented neighbor');
  assert.match(result.narrative, /Apollo 11 & Space Rations|The Green Cheese Myth/);
});

test('Unknown terms - Object.prototype names are not concepts', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const result = exploreConnection(name, name);

    assert.equal(result.status, 'unknown', `${name} should be unknown`);
    assert.deepEqual(result.unknownTerms, [name, name]);
  }

  const mixed = exploreConnection('constructor', 'moon');
  assert.equal(mixed.status, 'unknown');
  assert.deepEqual(mixed.unknownTerms, ['constructor']);
  assert.equal(findConnectionPath('constructor', 'moon'), null);
});

test('Unknown terms - report which words are not indexed and suggest known concepts', () => {
  const result = exploreConnection('banana', 'moon');

  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.unknownTerms, ['banana']);
  assert.ok(result.suggestions.includes('The Moon'));
  assert.ok(result.suggestions.includes('Cheese'));

  const both = exploreConnection('banana', 'zeppelin');
  assert.deepEqual(both.unknownTerms, ['banana', 'zeppelin']);
});

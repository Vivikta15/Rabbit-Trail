const test = require('node:test');
const assert = require('node:assert/strict');

const { SLATE, AMBER, STATUS, CREAM, contrast } = require('../dist/lib/theme/palette.js');

const AA = 4.5;
const bg = SLATE[950];
const card = SLATE[900];

test('Contrast - the checker itself is right (black on white is 21, same colour is 1)', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#336699', '#336699'), 1);
});

test('Text - every text colour is readable on the page and on a card', () => {
  for (const shade of [100, 200, 300, 400, 500]) {
    for (const [name, surface] of [['page', bg], ['card', card]]) {
      const c = contrast(SLATE[shade], surface);
      assert.ok(c >= AA, `slate-${shade} on the ${name} is only ${c.toFixed(2)}:1`);
    }
  }
});

test('Text - the main text is comfortably strong, not just passing', () => {
  assert.ok(contrast(SLATE[100], bg) >= 7);
  assert.ok(contrast(SLATE[100], card) >= 7);
});

test('Accent - coral text is readable on the page and on a card', () => {
  for (const surface of [bg, card]) assert.ok(contrast(AMBER[700], surface) >= AA);
});

test('Buttons - cream text on coral is readable, and still is when the button is hovered', () => {
  assert.ok(contrast(CREAM, AMBER[400]) >= AA, `cream on coral is ${contrast(CREAM, AMBER[400]).toFixed(2)}:1`);
  assert.ok(contrast(CREAM, AMBER[500]) >= AA);
});

test('Surfaces - a card is lighter than the page, so it reads as a panel, and borders show against both', () => {
  assert.ok(contrast(card, bg) >= 1.1);
  for (const surface of [bg, card]) assert.ok(contrast(SLATE[600], surface) >= 1.8, 'a strong border is visible');
  assert.ok(contrast(SLATE[800], card) >= 1.2, 'a soft border is visible on a card');
});

test('Hover - dark text stays readable on the hover surfaces', () => {
  for (const shade of [700, 800]) assert.ok(contrast(SLATE[100], SLATE[shade]) >= AA, `slate-100 on slate-${shade}`);
});

test('Status colours - success, warning, danger and info text are readable on the page and on a card', () => {
  for (const [name, colour] of Object.entries(STATUS)) {
    for (const surface of [bg, card]) assert.ok(contrast(colour, surface) >= AA, `${name} is only ${contrast(colour, surface).toFixed(2)}:1`);
  }
});

test('Scales - both scales cover every shade the app uses', () => {
  for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) assert.ok(SLATE[shade], `slate-${shade}`);
  for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) assert.ok(AMBER[shade], `amber-${shade}`);
});

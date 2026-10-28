const test = require('node:test');
const assert = require('node:assert/strict');

const { siteUrl, shareUrl, storyShareText, archetypeShareText, storyPath, archetypePath } = require('../dist/lib/share/share.js');

const story = (over = {}) => ({
  id: 'story-battle-of-lepanto',
  title: "John of Austria's Gamble at Lepanto",
  topic: 'Naval warfare',
  facts: [{ claim: 'The Holy League fleet defeated the Ottoman fleet in 1571.' }],
  counterArgument: { thesis: 'The victory changed less than it seemed.' },
  ...over,
});

// ---- the site address ------------------------------------------------------------------------------------------------------

test('Site URL - an explicit SITE_URL wins, then the Vercel production address, then localhost', () => {
  assert.equal(siteUrl({ SITE_URL: 'https://rabbittrail.app', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }), 'https://rabbittrail.app');
  assert.equal(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'rabbittrail.vercel.app' }), 'https://rabbittrail.vercel.app');
  assert.equal(siteUrl({}), 'http://localhost:3000');
});

test('Site URL - trailing slashes are dropped and anything that is not a web address is ignored', () => {
  assert.equal(siteUrl({ SITE_URL: 'https://rabbittrail.app///' }), 'https://rabbittrail.app');
  for (const bad of ['javascript:alert(1)', 'ftp://x.y', 'not a url', '', '   ']) {
    assert.equal(siteUrl({ SITE_URL: bad, VERCEL_PROJECT_PRODUCTION_URL: 'rabbittrail.vercel.app' }), 'https://rabbittrail.vercel.app', bad);
  }
});

// ---- links we share ----------------------------------------------------------------------------------------------------------

test('Share URL - joins the site and path and tags the channel', () => {
  assert.equal(shareUrl('https://rabbittrail.app', '/story/story-x', 'telegram'), 'https://rabbittrail.app/story/story-x?utm_source=telegram');
});

test('Share URL - keeps existing parameters and cleans the channel name', () => {
  assert.equal(shareUrl('https://r.app', '/onboarding?archetype=detective', 'Hacker-News'), 'https://r.app/onboarding?archetype=detective&utm_source=hacker-news');
  assert.equal(shareUrl('https://r.app', '/story/x', 'bad source!'), 'https://r.app/story/x?utm_source=direct');
});

test('Share URL - a path must stay on this site', () => {
  for (const bad of ['//evil.example/x', 'https://evil.example/x', 'story/x', '']) {
    assert.throws(() => shareUrl('https://r.app', bad, 'x'), /path/i, bad);
  }
});

test('Paths - story and archetype pages', () => {
  assert.equal(storyPath('story-x'), '/story/story-x');
  assert.equal(archetypePath('detective'), '/onboarding?archetype=detective');
});

// ---- what the share says -------------------------------------------------------------------------------------------------------

test('Story share text - leads with the story, offers the other side, and says the claims are checked', () => {
  const t = storyShareText(story());

  assert.match(t, /John of Austria/);
  assert.match(t, /Holy League/);
  assert.match(t, /other side/i);
  assert.match(t, /checked against (its|the) source/i);
});

test('Story share text - stays within a short post even for long stories', () => {
  const long = story({ title: 'T'.repeat(200), facts: [{ claim: 'C'.repeat(600) }], counterArgument: { thesis: 'X'.repeat(600) } });
  const t = storyShareText(long);

  assert.ok(t.length <= 240, `was ${t.length} characters`);
  assert.match(t, /checked against (its|the) source/i, 'the closing line is never cut off');
});

test('Story share text - a story with no facts still reads sensibly', () => {
  const t = storyShareText(story({ facts: [], counterArgument: undefined }));
  assert.match(t, /John of Austria/);
});

test('Archetype share text - names the type and invites a friend to find theirs', () => {
  const t = archetypeShareText('The Detective');

  assert.match(t, /The Detective/);
  assert.match(t, /archetype/i);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadSocialConfig } = require('../dist/lib/social/config.js');
const { composePost, graphemeCount } = require('../dist/lib/social/compose.js');
const { createTelegramClient } = require('../dist/lib/social/telegram.js');
const { createDiscordClient } = require('../dist/lib/social/discord.js');
const { createBlueskyClient } = require('../dist/lib/social/bluesky.js');
const { postNewestStory, createSocialStore, SocialPostError } = require('../dist/lib/social/post.js');
const { createFakePostgrest } = require('./helpers/fake-postgrest.js');
const { createSupabaseRest } = require('../dist/lib/db/supabase-rest.js');

const BASE = 'https://rabbittrail.vercel.app';
const TG_TOKEN = '123456789:' + 'A'.repeat(35);
const BSKY_PW = 'abcd-efgh-ijkl-mnop';
const DISCORD = 'https://discord.com/api/webhooks/123456789012345678/' + 'x'.repeat(40);

const story = (over = {}) => ({
  id: 'story-battle-of-lepanto',
  date: '2026-10-28',
  title: "John of Austria's Gamble at Lepanto",
  topic: 'Naval warfare',
  era: '16th century',
  decisionContext: 'A fleet gathered.',
  facts: [{ claim: 'The Holy League fleet defeated the Ottoman fleet in 1571.' }],
  counterArgument: { thesis: 'The victory changed less than it seemed.' },
  ...over,
});

const res = (status, body = {}, bytes) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
  text: async () => JSON.stringify(body),
  arrayBuffer: async () => bytes ?? new ArrayBuffer(0),
});

// ---- which channels are set up ------------------------------------------------------------------------------------------

test('Social config - nothing set means no channels, and that is fine', () => {
  assert.deepEqual(loadSocialConfig({}), { channels: [], problems: [] });
});

test('Social config - each channel is on only when all of its settings are good', () => {
  const r = loadSocialConfig({
    TELEGRAM_BOT_TOKEN: TG_TOKEN,
    TELEGRAM_CHAT_ID: '@rabbittrail',
    BLUESKY_HANDLE: 'rabbittrail.bsky.social',
    BLUESKY_APP_PASSWORD: BSKY_PW,
    DISCORD_WEBHOOK_URL: DISCORD,
  });

  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.channels.map((c) => c.channel).sort(), ['bluesky', 'discord', 'telegram']);
});

test('Social config - half a channel is reported, not silently skipped', () => {
  const r = loadSocialConfig({ TELEGRAM_BOT_TOKEN: TG_TOKEN, BLUESKY_HANDLE: 'rabbittrail.bsky.social' });

  assert.equal(r.channels.length, 0);
  assert.ok(r.problems.some((p) => /Telegram/i.test(p) && /TELEGRAM_CHAT_ID/.test(p)));
  assert.ok(r.problems.some((p) => /Bluesky/i.test(p) && /BLUESKY_APP_PASSWORD/.test(p)));
});

test('Social config - a Bluesky MAIN password is refused: only an app password is allowed', () => {
  const r = loadSocialConfig({ BLUESKY_HANDLE: 'rabbittrail.bsky.social', BLUESKY_APP_PASSWORD: 'MyRealPassword123!' });

  assert.equal(r.channels.length, 0);
  assert.ok(r.problems.some((p) => /app password/i.test(p)));
  assert.equal(r.problems.join(' ').includes('MyRealPassword123!'), false, 'the message never repeats it');
});

test('Social config - only a real Discord webhook address is accepted', () => {
  for (const bad of ['https://evil.example/api/webhooks/1/abc', 'http://discord.com/api/webhooks/1/abc', 'not a url', 'https://discord.com/other/path']) {
    const r = loadSocialConfig({ DISCORD_WEBHOOK_URL: bad });
    assert.equal(r.channels.length, 0, bad);
    assert.ok(r.problems.some((p) => /Discord/i.test(p)), bad);
    assert.equal(r.problems.join(' ').includes(bad), false, 'the address is a secret too');
  }
});

test('Social config - a malformed Telegram token or chat is refused without repeating it', () => {
  const r = loadSocialConfig({ TELEGRAM_BOT_TOKEN: 'not-a-token', TELEGRAM_CHAT_ID: 'drop table' });

  assert.equal(r.channels.length, 0);
  assert.equal(r.problems.join(' ').includes('not-a-token'), false);
});

// ---- the post for each channel ---------------------------------------------------------------------------------------------

test('Compose - every post links to the story, tagged with its own channel', () => {
  for (const channel of ['telegram', 'bluesky', 'discord']) {
    const p = composePost(story(), channel, BASE);
    assert.equal(p.url, `${BASE}/story/story-battle-of-lepanto?utm_source=${channel}`);
    assert.match(p.text, /John of Austria/);
    assert.match(p.text, /checked against its source/i);
  }
});

test('Compose - respects each channel\'s length limit, even for a very long story', () => {
  const long = story({ title: 'T'.repeat(500), facts: [{ claim: 'C'.repeat(2000) }], counterArgument: { thesis: 'X'.repeat(2000) } });

  assert.ok(graphemeCount(composePost(long, 'bluesky', BASE).text) <= 300);
  assert.ok(composePost(long, 'telegram', BASE).text.length <= 4096);
  assert.ok(composePost(long, 'discord', BASE).text.length <= 2000);
});

test('Compose - counts characters the way Bluesky does, so emoji and accents cannot push a post over', () => {
  assert.equal(graphemeCount('abc'), 3);
  assert.equal(graphemeCount('é'), 1);
  assert.equal(graphemeCount('👨‍👩‍👧'), 1);
});

test('Compose - the card image for a story is its share card', () => {
  assert.equal(composePost(story(), 'bluesky', BASE).imageUrl, `${BASE}/api/og?story=story-battle-of-lepanto`);
});

// ---- the channel clients ------------------------------------------------------------------------------------------------------

const post = (channel = 'telegram') => composePost(story(), channel, BASE);

test('Telegram - sends the text and link to the chat, with the token only in the address', async () => {
  const calls = [];
  const client = createTelegramClient({ token: TG_TOKEN, chatId: '@rabbittrail', fetchImpl: async (url, init) => (calls.push({ url, init }), res(200, { ok: true })) });

  await client.post(post());

  assert.equal(calls[0].url, `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.chat_id, '@rabbittrail');
  assert.match(body.text, /utm_source=telegram/);
});

test('Telegram - a failure says what happened and never contains the token', async () => {
  const failing = createTelegramClient({ token: TG_TOKEN, chatId: '@x', fetchImpl: async () => res(401, { ok: false, description: 'Unauthorized' }) });
  await assert.rejects(() => failing.post(post()), (e) => e instanceof SocialPostError && /Telegram/.test(e.message) && !e.message.includes(TG_TOKEN));

  const offline = createTelegramClient({ token: TG_TOKEN, chatId: '@x', fetchImpl: async (url) => { throw new Error(`failed ${url}`); } });
  await assert.rejects(() => offline.post(post()), (e) => e instanceof SocialPostError && !e.message.includes(TG_TOKEN));
});

test('Discord - posts to the webhook and treats an empty 204 as success', async () => {
  const calls = [];
  const client = createDiscordClient({ webhookUrl: DISCORD, fetchImpl: async (url, init) => (calls.push({ url, init }), res(204)) });

  await client.post(post('discord'));

  assert.equal(calls[0].url, DISCORD);
  assert.match(JSON.parse(calls[0].init.body).content, /utm_source=discord/);
});

test('Discord - a rate limit or bad webhook is reported without the webhook address', async () => {
  for (const status of [429, 404]) {
    const client = createDiscordClient({ webhookUrl: DISCORD, fetchImpl: async () => res(status, { message: 'x' }) });
    await assert.rejects(() => client.post(post('discord')), (e) => e instanceof SocialPostError && /Discord/.test(e.message) && !e.message.includes('x'.repeat(40)));
  }
});

function blueskyFetch({ failImage = false, authStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('com.atproto.server.createSession')) return authStatus === 200 ? res(200, { accessJwt: 'jwt-token', did: 'did:plc:abc' }) : res(authStatus, { error: 'AuthenticationRequired' });
    if (url.includes('/api/og')) return failImage ? res(500) : res(200, {}, new Uint8Array([1, 2, 3]).buffer);
    if (url.endsWith('com.atproto.repo.uploadBlob')) return res(200, { blob: { $type: 'blob', ref: { $link: 'cid' }, mimeType: 'image/png', size: 3 } });
    if (url.endsWith('com.atproto.repo.createRecord')) return res(200, { uri: 'at://x' });
    return res(404);
  };
  return { calls, fetchImpl };
}

test('Bluesky - signs in with the app password, uploads the card, and posts a link card', async () => {
  const { calls, fetchImpl } = blueskyFetch();
  const client = createBlueskyClient({ handle: 'rabbittrail.bsky.social', appPassword: BSKY_PW, fetchImpl });

  await client.post(post('bluesky'));

  const session = calls.find((c) => c.url.endsWith('createSession'));
  assert.deepEqual(JSON.parse(session.init.body), { identifier: 'rabbittrail.bsky.social', password: BSKY_PW });
  const record = JSON.parse(calls.find((c) => c.url.endsWith('createRecord')).init.body);
  assert.equal(record.repo, 'did:plc:abc');
  assert.equal(record.collection, 'app.bsky.feed.post');
  assert.equal(record.record.embed.$type, 'app.bsky.embed.external');
  assert.match(record.record.embed.external.uri, /utm_source=bluesky/);
  assert.ok(record.record.embed.external.thumb, 'the share card is attached');
  assert.ok(graphemeCount(record.record.text) <= 300);
});

test('Bluesky - still posts if the card image cannot be fetched', async () => {
  const { calls, fetchImpl } = blueskyFetch({ failImage: true });
  const client = createBlueskyClient({ handle: 'rabbittrail.bsky.social', appPassword: BSKY_PW, fetchImpl });

  await client.post(post('bluesky'));

  const record = JSON.parse(calls.find((c) => c.url.endsWith('createRecord')).init.body);
  assert.equal(record.record.embed.external.thumb, undefined);
});

test('Bluesky - a rejected sign-in is reported kindly and never repeats the password', async () => {
  const { fetchImpl } = blueskyFetch({ authStatus: 401 });
  const client = createBlueskyClient({ handle: 'rabbittrail.bsky.social', appPassword: BSKY_PW, fetchImpl });

  await assert.rejects(() => client.post(post('bluesky')), (e) => e instanceof SocialPostError && /app password/i.test(e.message) && !e.message.includes(BSKY_PW));
});

// ---- posting the day's story once --------------------------------------------------------------------------------------------

function world({ clients, stories } = {}) {
  const fake = createFakePostgrest({ serviceKey: 'sb_secret_' + 'S'.repeat(30) });
  const rest = createSupabaseRest({ url: 'https://abcdefghij.supabase.co', serviceKey: 'sb_secret_' + 'S'.repeat(30), fetchImpl: fake.fetchImpl, retry: { retries: 0 } });
  const sent = [];
  const make = (channel, behaviour = async () => {}) => ({ channel, post: async (p) => { sent.push({ channel, url: p.url }); await behaviour(p); } });
  return { fake, store: createSocialStore(rest), sent, make, run: (opts = {}) => postNewestStory({ stories: stories ?? [story()], store: createSocialStore(rest), clients: clients ?? [make('telegram'), make('discord')], base: BASE, log: () => {}, ...opts }) };
}

test('Post - the newest story goes to every configured channel and is remembered', async () => {
  const w = world();
  const clients = [w.make('telegram'), w.make('bluesky')];

  const results = await w.run({ clients });

  assert.deepEqual(results.map((r) => [r.channel, r.status]), [['telegram', 'posted'], ['bluesky', 'posted']]);
  assert.equal(w.fake.tables.social_posts.length, 2);
});

test('Post - running again never posts the same story twice', async () => {
  const w = world();
  const clients = [w.make('telegram')];

  await w.run({ clients });
  const second = await w.run({ clients });

  assert.equal(w.sent.length, 1);
  assert.deepEqual(second.map((r) => r.status), ['skipped']);
});

test('Post - a channel that fails does not stop the others, and is tried again next time', async () => {
  const w = world();
  let down = true;
  const clients = [w.make('telegram', async () => { if (down) throw new SocialPostError('Telegram is down'); }), w.make('discord')];

  const first = await w.run({ clients });
  assert.deepEqual(first.map((r) => r.status), ['failed', 'posted']);
  assert.equal(first[0].reason, 'Telegram is down');
  assert.deepEqual(w.fake.tables.social_posts.map((r) => r.channel), ['discord'], 'only the success is remembered');

  down = false;
  const second = await w.run({ clients });
  assert.deepEqual(second.map((r) => r.status), ['posted', 'skipped']);
});

test('Post - only the newest story is considered, never the back catalogue', async () => {
  const w = world({ stories: [story({ id: 'story-old', date: '2026-10-20' }), story({ id: 'story-new', date: '2026-10-28' }), story({ id: 'story-mid', date: '2026-10-25' })] });

  await w.run({ clients: [w.make('telegram')] });

  assert.equal(w.sent.length, 1);
  assert.match(w.sent[0].url, /story-new/);
});

test('Post - a dry run says what it would do and changes nothing', async () => {
  const w = world();

  const results = await w.run({ clients: [w.make('telegram')], dryRun: true });

  assert.deepEqual(results.map((r) => r.status), ['dry-run']);
  assert.equal(w.sent.length, 0);
  assert.equal(w.fake.tables.social_posts.length, 0);
});

test('Post - no stories means nothing to post, and no channels means nothing to do', async () => {
  const none = world({ stories: [] });
  assert.deepEqual(await none.run({ clients: [none.make('telegram')] }), []);

  const w = world();
  assert.deepEqual(await w.run({ clients: [] }), []);
});

test('Post - a failure to remember a post is reported, so it is noticed before it double-posts', async () => {
  const w = world();
  w.fake.tables.social_posts = null; // break the table
  const results = await w.run({ clients: [w.make('telegram')] }).catch((e) => e);

  assert.ok(results instanceof Error || results.some((r) => r.status === 'failed'), 'the problem is surfaced');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PipelineAbort,
  ModelOutputError,
  HttpStatusError,
  TimeoutError,
  withRetry,
  fetchWithTimeout,
  retryAfterMs,
} = require('../dist/lib/pipeline/http.js');
const { createAnthropicClient } = require('../dist/lib/pipeline/llm-client.js');
const { fetchPage } = require('../dist/lib/pipeline/wikipedia.js');
const { generateNextStory } = require('../dist/lib/pipeline/run.js');
const { loadRejected } = require('../dist/lib/pipeline/publish.js');
const { loadCatalog } = require('../dist/lib/stories/catalog.js');
const { VERIFIED_STORIES } = require('../dist/data/stories.js');
const { ARCHETYPES } = require('../dist/data/archetypes.js');

const fakeKey = () => 'sk-ant-' + 'api03-' + 'Q'.repeat(40);
const noWait = () => {
  const delays = [];
  return { delays, sleep: async (ms) => { delays.push(ms); }, random: () => 0 };
};

// ---- retry helper ------------------------------------------------------------------------------

test('Retry - succeeds after transient failures, waiting longer each time', async () => {
  const { delays, sleep, random } = noWait();
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new HttpStatusError('busy', 503);
      return 'ok';
    },
    { retries: 3, baseDelayMs: 1000, maxDelayMs: 30000, sleep, random },
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('Retry - gives up after the retry limit and rethrows the last error', async () => {
  const { delays, sleep, random } = noWait();
  let calls = 0;

  await assert.rejects(
    () => withRetry(async () => { calls += 1; throw new HttpStatusError('busy', 529); }, { retries: 2, baseDelayMs: 10, maxDelayMs: 100, sleep, random }),
    (err) => err.status === 529,
  );
  assert.equal(calls, 3, 'one try plus two retries');
  assert.equal(delays.length, 2);
});

test('Retry - never retries a request that cannot succeed (bad key, bad request)', async () => {
  for (const status of [400, 401, 403, 404]) {
    const { sleep, random } = noWait();
    let calls = 0;
    await assert.rejects(() => withRetry(async () => { calls += 1; throw new HttpStatusError('no', status); }, { retries: 3, baseDelayMs: 1, maxDelayMs: 1, sleep, random }));
    assert.equal(calls, 1, `status ${status} must not be retried`);
  }
});

test('Retry - retries rate limits, server errors, timeouts and network failures', async () => {
  for (const err of [new HttpStatusError('x', 429), new HttpStatusError('x', 500), new HttpStatusError('x', 502), new HttpStatusError('x', 503), new HttpStatusError('x', 504), new TimeoutError('slow'), new TypeError('fetch failed')]) {
    const { sleep, random } = noWait();
    let calls = 0;
    await withRetry(async () => { calls += 1; if (calls === 1) throw err; return 'ok'; }, { retries: 1, baseDelayMs: 1, maxDelayMs: 1, sleep, random });
    assert.equal(calls, 2, err.message);
  }
});

test('Retry - honours Retry-After when it asks for longer than the backoff, within a cap', async () => {
  const { delays, sleep, random } = noWait();
  let calls = 0;
  await withRetry(
    async () => { calls += 1; if (calls === 1) throw new HttpStatusError('limited', 429, 7000); return 'ok'; },
    { retries: 1, baseDelayMs: 1000, maxDelayMs: 30000, sleep, random },
  );
  assert.deepEqual(delays, [7000]);

  const capped = noWait();
  let n = 0;
  await withRetry(
    async () => { n += 1; if (n === 1) throw new HttpStatusError('limited', 429, 9999999); return 'ok'; },
    { retries: 1, baseDelayMs: 1000, maxDelayMs: 30000, sleep: capped.sleep, random: capped.random },
  );
  assert.ok(capped.delays[0] <= 60000, 'a huge Retry-After must not stall the run for hours');
});

test('Retry - an abort or a bad model answer is never retried', async () => {
  for (const err of [new PipelineAbort('stop'), new ModelOutputError('bad')]) {
    const { sleep, random } = noWait();
    let calls = 0;
    await assert.rejects(() => withRetry(async () => { calls += 1; throw err; }, { retries: 3, baseDelayMs: 1, maxDelayMs: 1, sleep, random }));
    assert.equal(calls, 1);
  }
});

test('Retry-After header - parses seconds, ignores nonsense', () => {
  assert.equal(retryAfterMs('7'), 7000);
  assert.equal(retryAfterMs('0'), 0);
  assert.equal(retryAfterMs('abc'), undefined);
  assert.equal(retryAfterMs(null), undefined);
  assert.equal(retryAfterMs('-5'), undefined);
});

// ---- timeout ------------------------------------------------------------------------------------

test('Timeout - a request that never answers is cut off with a clear error', async () => {
  const hang = () => new Promise(() => {});

  await assert.rejects(() => fetchWithTimeout(hang, 'https://example.test', {}, 25), (err) => err instanceof TimeoutError && /25/.test(err.message));
});

test('Timeout - a fast response is returned untouched', async () => {
  const res = await fetchWithTimeout(async () => ({ ok: true, status: 200 }), 'https://example.test', {}, 1000);

  assert.equal(res.status, 200);
});

// ---- anthropic client --------------------------------------------------------------------------

const reply = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const textBody = (text, extra = {}) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, ...extra });

function client(responses, extra = {}) {
  const calls = [];
  const wait = noWait();
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, wait, c: createAnthropicClient({ apiKey: fakeKey(), model: 'm', fetchImpl, sleep: wait.sleep, random: wait.random, ...extra }) };
}

test('Anthropic - retries a rate limit and then succeeds', async () => {
  const { c, calls } = client([reply(429, {}, { 'retry-after': '2' }), reply(200, textBody('hello'))]);

  assert.equal(await c.complete('s', 'u'), 'hello');
  assert.equal(calls.length, 2);
});

test('Anthropic - retries a network failure and a server error', async () => {
  const { c, calls } = client([new TypeError('fetch failed'), reply(503), reply(200, textBody('fine'))]);

  assert.equal(await c.complete('s', 'u'), 'fine');
  assert.equal(calls.length, 3);
});

test('Anthropic - a rejected key stops at once with a fix, and never repeats the key', async () => {
  const { c, calls } = client([reply(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } })]);

  await assert.rejects(
    () => c.complete('s', 'u'),
    (err) => err instanceof PipelineAbort && /setup:key/.test(err.message) && !err.message.includes('QQQQQ'),
  );
  assert.equal(calls.length, 1, 'a bad key must not be retried');
});

test('Anthropic - a refused key is a distinct AuthError so setup can tell it from an outage', async () => {
  const { AuthError } = require('../dist/lib/pipeline/http.js');
  const { c } = client([reply(401, { error: { message: 'invalid x-api-key' } })]);
  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof AuthError);

  const outage = client([reply(503)], { retry: { retries: 0 } });
  await assert.rejects(() => outage.c.complete('s', 'u'), (err) => err instanceof PipelineAbort && !(err instanceof AuthError));
});

test('Anthropic - an unknown model stops the run with a pointer to STORY_MODEL', async () => {
  const { c } = client([reply(404, { error: { type: 'not_found_error', message: 'model: nope' } })]);

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /STORY_MODEL/.test(err.message));
});

test('Anthropic - other rejected requests stop the run with the server message', async () => {
  const { c } = client([reply(400, { error: { type: 'invalid_request_error', message: 'credit balance is too low' } })]);

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /credit balance is too low/.test(err.message));
});

test('Anthropic - when it stays unavailable the run stops saying to try again later', async () => {
  const { c, calls } = client([reply(529)], { retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 1 } });

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /try again later/i.test(err.message));
  assert.equal(calls.length, 3);
});

test('Anthropic - an answer cut off at the token limit is reported, not parsed as if complete', async () => {
  const { c } = client([reply(200, textBody('{"half":', { stop_reason: 'max_tokens' }))]);

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof ModelOutputError && /cut off|token limit/i.test(err.message));
});

test('Anthropic - tracks calls and token usage across a run', async () => {
  const { c } = client([reply(200, textBody('a')), reply(200, textBody('b', { usage: { input_tokens: 100, output_tokens: 40 } }))]);

  await c.complete('s', 'u');
  await c.complete('s', 'u');

  assert.deepEqual(c.usage(), { calls: 2, inputTokens: 110, outputTokens: 45 });
});

// ---- wikipedia ---------------------------------------------------------------------------------

const wikiOk = () => ({
  query: { pages: { 1: { pageid: 1, ns: 0, title: 'T', fullurl: 'https://en.wikipedia.org/wiki/T', extract: 'Some text.', revisions: [{ revid: 9 }], links: [] } } },
});

test('Wikipedia - retries a busy server and then returns the page', async () => {
  const wait = noWait();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls < 3 ? reply(503) : reply(200, wikiOk());
  };

  const page = await fetchPage('T', fetchImpl, { retry: { retries: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: wait.sleep, random: wait.random } });

  assert.equal(page.title, 'T');
  assert.equal(calls, 3);
});

test('Wikipedia - a refused request stops the run instead of being retried', async () => {
  const wait = noWait();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return reply(403); };

  await assert.rejects(
    () => fetchPage('T', fetchImpl, { retry: { retries: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: wait.sleep, random: wait.random } }),
    (err) => err instanceof PipelineAbort && /403/.test(err.message),
  );
  assert.equal(calls, 1);
});

test('Wikipedia - staying unreachable stops the run saying to try again later', async () => {
  const wait = noWait();
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };

  await assert.rejects(
    () => fetchPage('T', fetchImpl, { retry: { retries: 1, baseDelayMs: 1, maxDelayMs: 1, sleep: wait.sleep, random: wait.random } }),
    (err) => err instanceof PipelineAbort && /try again later/i.test(err.message),
  );
});

// ---- orchestration under failure ---------------------------------------------------------------

const Q = ['In 1571 the allied fleet destroyed most of the Ottoman navy near the Gulf of Patras.', 'Don John of Austria commanded the Holy League fleet against the advice of several captains.', 'The Venetian galleasses opened the battle by breaking the Ottoman line with heavy cannon fire.', 'Historians still dispute how much the victory changed the balance of power in the Mediterranean.'];
const goodPage = () => ({ title: 'Good Page', url: 'https://en.wikipedia.org/wiki/Good_Page', revisionId: 7, text: Q.join('\n\n'), links: [] });
const draft = () => ({
  suitable: true, title: 'T', protagonist: 'P', topic: 'Topic', era: 'Era', decisionContext: 'Ctx.',
  facts: Q.slice(0, 3).map((q, i) => ({ claim: `c${i}`, evidenceQuote: q })),
  counterArgument: { thesis: 't', evidence: 'e', unresolvedPoints: 'u', evidenceQuote: Q[3] },
  whatWeCantProve: 'w',
  presentationVariants: Object.fromEntries(Object.keys(ARCHETYPES).map((id) => [id, { hook: 'h', narrativePacing: 'p', introFraming: 'f', analogy: 'a' }])),
});
const judgeOk = { claims: [0, 1, 2, 3].map((index) => ({ index, supported: true, reason: '' })), variantsAddNewFacts: false };

function dirWith(related) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-trail-resilience-'));
  const clone = structuredClone(VERIFIED_STORIES[0]);
  Object.assign(clone, { id: 'story-seed-clone', date: '2026-10-01', source: { title: 'Seed Clone', url: 'https://en.wikipedia.org/wiki/Seed_Clone' }, relatedTopics: related });
  fs.writeFileSync(path.join(dir, 'seed-clone.json'), JSON.stringify(clone));
  return dir;
}

const wikiOf = (pages) => ({ fetchPage: async (t) => (pages[t] === undefined ? null : typeof pages[t] === 'function' ? pages[t]() : pages[t]) });

test('Run - an outage aborts the run without blaming the topic', async () => {
  const dir = dirWith(['Good Page', 'Other Page']);
  const llm = { async complete() { throw new PipelineAbort('Anthropic is busy right now. Please try again later.'); } };

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki: wikiOf({ 'Good Page': goodPage() }), llm, maxAttempts: 5 });

  assert.equal(result.status, 'aborted');
  assert.match(result.reason, /try again later/i);
  assert.equal(loadRejected(dir).size, 0, 'an outage must not blacklist any topic');
});

test('Run - a wikipedia outage aborts the run too', async () => {
  const dir = dirWith(['Good Page']);
  const wiki = { fetchPage: async () => { throw new PipelineAbort('Wikipedia is unreachable. Please try again later.'); } };

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm: { async complete() { return '{}'; } }, maxAttempts: 3 });

  assert.equal(result.status, 'aborted');
});

test('Run - one bad answer or surprise error on a topic moves on to the next topic', async () => {
  const dir = dirWith(['Good Page', 'Better Page']);
  const pages = { 'Good Page': goodPage(), 'Better Page': { ...goodPage(), title: 'Better Page', url: 'https://en.wikipedia.org/wiki/Better_Page' } };
  let n = 0;
  const llm = {
    async complete(system, user) {
      if (/CLAIMS TO CHECK/.test(user)) return JSON.stringify(judgeOk);
      n += 1;
      if (n === 1) throw new ModelOutputError('The answer was cut off at the token limit.');
      return JSON.stringify(draft());
    },
  };

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki: wikiOf(pages), llm, maxAttempts: 5 });

  assert.equal(result.status, 'published');
  assert.equal(result.id, 'story-better-page');
  assert.equal(loadRejected(dir).has('good page'), false, 'a cut-off answer is not the page\'s fault');
});

test('Run - a story id that already exists on disk is skipped, not a crash', async () => {
  const dir = dirWith(['Good Page', 'Better Page']);
  // A stray file already uses the id the first topic would get, but it is not a valid story so the catalog ignores it.
  fs.writeFileSync(path.join(dir, 'story-good-page.json'), '{"half-written":');
  const pages = { 'Good Page': goodPage(), 'Better Page': { ...goodPage(), title: 'Better Page', url: 'https://en.wikipedia.org/wiki/Better_Page' } };
  const llm = { async complete(system, user) { return JSON.stringify(/CLAIMS TO CHECK/.test(user) ? judgeOk : draft()); } };

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki: wikiOf(pages), llm, maxAttempts: 5 });

  assert.equal(result.status, 'published');
  assert.equal(result.id, 'story-better-page');
  assert.equal(fs.readFileSync(path.join(dir, 'story-good-page.json'), 'utf-8'), '{"half-written":', 'the stray file must not be overwritten');
});

test('Run - stops when the model-call budget is spent, so a bad day cannot run up a bill', async () => {
  const dir = dirWith(['A One', 'B Two', 'C Three', 'D Four']);
  const pages = Object.fromEntries(['A One', 'B Two', 'C Three', 'D Four'].map((t) => [t, { ...goodPage(), title: t, url: `https://en.wikipedia.org/wiki/${t}` }]));
  let calls = 0;
  const llm = { async complete() { calls += 1; return JSON.stringify({ suitable: false, reason: 'no' }); } };

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki: wikiOf(pages), llm, maxAttempts: 10, maxModelCalls: 2 });

  assert.equal(calls, 2);
  assert.equal(result.status, 'aborted');
  assert.match(result.reason, /budget/i);
});

test('Run - never leaves a half-written story behind when publishing fails midway', async () => {
  const dir = dirWith(['Good Page']);
  const llm = { async complete(system, user) { return JSON.stringify(/CLAIMS TO CHECK/.test(user) ? judgeOk : draft()); } };
  const result = await generateNextStory({ dir, today: '2026-10-22', wiki: wikiOf({ 'Good Page': goodPage() }), llm, maxAttempts: 1 });

  assert.equal(result.status, 'published');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
  assert.equal(loadCatalog(dir).some((s) => s.id === 'story-good-page'), true);
});

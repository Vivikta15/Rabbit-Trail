const test = require('node:test');
const assert = require('node:assert/strict');

const { createGeminiClient } = require('../dist/lib/pipeline/gemini-client.js');
const { AuthError, ModelOutputError, PipelineAbort } = require('../dist/lib/pipeline/http.js');

// Built by concatenation so no key-looking literal sits in the repo.
const KEY = 'AIza' + 'Sy' + 'G'.repeat(33);
const noWait = () => ({ sleep: async () => {}, random: () => 0 });

const reply = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const answer = (text, extra = {}) => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  ...extra,
});

const googleError = (status, message, code) => ({ error: { code: status, message, status: code } });

function client(responses, extra = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, c: createGeminiClient({ apiKey: KEY, model: 'gemini-3.8-flash', fetchImpl, ...noWait(), ...extra }) };
}

test('Gemini - sends the documented request: model in the URL, key in a header, system prompt separate', async () => {
  const { c, calls } = client([reply(200, answer('hello'))]);

  assert.equal(await c.complete('SYSTEM TEXT', 'USER TEXT'), 'hello');

  const { url, init } = calls[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.equal(url.includes(KEY), false, 'the key must never be placed in the URL');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'SYSTEM TEXT' }] });
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'USER TEXT' }] }]);
  assert.ok(body.generationConfig.maxOutputTokens >= 8000, 'room for the answer plus any hidden thinking');
});

test('Gemini - a model name cannot break out of the URL path', async () => {
  const { calls, c } = client([reply(200, answer('ok'))]);
  const evil = createGeminiClient({ apiKey: KEY, model: 'x/../../other', fetchImpl: async (u, i) => { calls.push({ url: u, init: i }); return reply(200, answer('ok')); }, ...noWait() });

  await evil.complete('s', 'u');
  assert.ok(c);
  assert.equal(calls[0].url.includes('/../'), false);
  assert.match(calls[0].url, /models\/x%2F\.\.%2F\.\.%2Fother:generateContent$/);
});

test('Gemini - joins the text parts and ignores hidden "thought" parts', async () => {
  const body = { candidates: [{ content: { parts: [{ text: 'secret reasoning', thought: true }, { text: 'Hello ' }, { text: 'world' }] }, finishReason: 'STOP' }] };
  const { c } = client([reply(200, body)]);

  assert.equal(await c.complete('s', 'u'), 'Hello world');
});

test('Gemini - retries a rate limit, a busy server and a network failure, then succeeds', async () => {
  const { c, calls } = client([reply(429, googleError(429, 'quota', 'RESOURCE_EXHAUSTED'), { 'retry-after': '1' }), reply(503, googleError(503, 'overloaded', 'UNAVAILABLE')), new TypeError('fetch failed'), reply(200, answer('fine'))]);

  assert.equal(await c.complete('s', 'u'), 'fine');
  assert.equal(calls.length, 4);
});

test('Gemini - a rejected key stops at once as an AuthError, with a fix, and never repeats the key', async () => {
  for (const [status, msg] of [[400, 'API key not valid. Please pass a valid API key.'], [401, 'unauthenticated'], [403, 'The caller does not have permission']]) {
    const { c, calls } = client([reply(status, googleError(status, msg, 'X'))]);

    await assert.rejects(
      () => c.complete('s', 'u'),
      (err) => err instanceof AuthError && /setup:gemini/.test(err.message) && !err.message.includes('SyGGGG'),
      String(status),
    );
    assert.equal(calls.length, 1, `status ${status} must not be retried`);
  }
});

test('Gemini - a 400 that is not about the key is an ordinary rejected request with the server message', async () => {
  const { c } = client([reply(400, googleError(400, 'Request contains an invalid argument.', 'INVALID_ARGUMENT'))]);

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && !(err instanceof AuthError) && /invalid argument/.test(err.message));
});

test('Gemini - an unknown model points at GEMINI_MODEL', async () => {
  const { c } = client([reply(404, googleError(404, 'models/nope is not found', 'NOT_FOUND'))]);

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /GEMINI_MODEL/.test(err.message));
});

test('Gemini - a quota that stays used up says what to do, not just "429"', async () => {
  const { c, calls } = client([reply(429, googleError(429, 'You exceeded your current quota', 'RESOURCE_EXHAUSTED'))], { retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 1 } });

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /quota/i.test(err.message) && /midnight Pacific/i.test(err.message) && /billing|GEMINI_MODEL/.test(err.message));
  assert.equal(calls.length, 3);
});

// ---- quota errors: the real shape Google sends (captured from a live free-tier key) ------------------------------

const quotaError = ({ quotaId, value = '20', model = 'gemini-3.8-flash', retryDelay, text = 'You exceeded your current quota.' }) => ({
  error: {
    code: 429,
    message: text,
    status: 'RESOURCE_EXHAUSTED',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: 'Learn more', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' }] },
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId, quotaDimensions: { location: 'global', model }, quotaValue: value }],
      },
      ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
    ],
  },
});

test('Gemini quota - a used-up DAILY limit stops at once and says exactly which limit, how long, and what to do', async () => {
  const { c, calls } = client([reply(429, quotaError({ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', retryDelay: '83053s' }))]);

  await assert.rejects(
    () => c.complete('s', 'u'),
    (err) => {
      assert.ok(err instanceof PipelineAbort && !(err instanceof AuthError));
      assert.match(err.message, /daily limit/i);
      assert.match(err.message, /gemini-3\.8-flash/);
      assert.match(err.message, /20 requests/);
      assert.match(err.message, /23 hours/);
      assert.match(err.message, /GEMINI_MODEL/);
      assert.match(err.message, /billing/i);
      assert.match(err.message, /own (daily )?limit/i, 'it should say each model has its own allowance');
      return true;
    },
  );
  assert.equal(calls.length, 1, 'waiting cannot help with a daily limit, so it must not be retried');
});

test('Gemini quota - a PER-MINUTE limit waits for the delay Google asks for, then carries on', async () => {
  const sleeps = [];
  const { c, calls } = client(
    [reply(429, quotaError({ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', retryDelay: '36s', value: '5' })), reply(200, answer('after the wait'))],
    { sleep: async (ms) => { sleeps.push(ms); } },
  );

  assert.equal(await c.complete('s', 'u'), 'after the wait');
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [36000], 'it must wait the whole delay Google asked for, not a shorter guess');
});

test('Gemini quota - understands the delay formats Google uses, and the one in the message text', async () => {
  for (const [retryDelay, text, expected] of [['44s', undefined, 44000], ['44.5s', undefined, 44500], [undefined, 'Quota exceeded.\nPlease retry in 12.2s.', 12200]]) {
    const sleeps = [];
    const { c } = client(
      [reply(429, quotaError({ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', retryDelay, text })), reply(200, answer('ok'))],
      { sleep: async (ms) => { sleeps.push(ms); } },
    );
    await c.complete('s', 'u');
    assert.deepEqual(sleeps, [expected], `${retryDelay ?? text}`);
  }
});

test('Gemini quota - a per-minute limit that never clears says so, with the limit, instead of calling it daily', async () => {
  const { c, calls } = client(
    [reply(429, quotaError({ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', retryDelay: '1s', value: '5' }))],
    { retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 1 } },
  );

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /per-minute/i.test(err.message) && /5 requests/.test(err.message) && !/daily limit/i.test(err.message));
  assert.equal(calls.length, 3);
});

test('Gemini quota - a huge delay on a per-minute-looking limit is capped, never stalling the run for hours', async () => {
  const sleeps = [];
  const { c } = client(
    [reply(429, quotaError({ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', retryDelay: '500000s' })), reply(200, answer('ok'))],
    { sleep: async (ms) => { sleeps.push(ms); } },
  );

  await c.complete('s', 'u');
  assert.ok(sleeps[0] <= 60000 * 1.25);
});

test('Gemini quota - an unknown model gets Google\'s own explanation, because it is more useful than ours', async () => {
  const body = googleError(404, 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash.', 'NOT_FOUND');
  const { c } = client([reply(404, body)]);

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /GEMINI_MODEL/.test(err.message) && /no longer available to new users/.test(err.message));
});

test('Gemini - a lasting outage says to try again later', async () => {
  const { c } = client([reply(503, googleError(503, 'overloaded', 'UNAVAILABLE'))], { retry: { retries: 1, baseDelayMs: 1, maxDelayMs: 1 } });

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /try again later/i.test(err.message));
});

test('Gemini - an answer cut off at the token limit is reported, not parsed as if complete', async () => {
  const body = { candidates: [{ content: { parts: [{ text: '{"half":' }] }, finishReason: 'MAX_TOKENS' }] };
  const { c } = client([reply(200, body)]);

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof ModelOutputError && /token limit/i.test(err.message));
});

test('Gemini - an answer stopped by a safety filter, or a blocked prompt, is a bad answer for this topic only', async () => {
  for (const body of [
    { candidates: [{ finishReason: 'SAFETY' }] },
    { candidates: [{ content: { parts: [] }, finishReason: 'RECITATION' }] },
    { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } },
    { candidates: [] },
  ]) {
    const { c } = client([reply(200, body)]);
    await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof ModelOutputError && !(err instanceof AuthError), JSON.stringify(body));
  }
});

test('Gemini - tracks calls and token usage, counting hidden thinking as output', async () => {
  const { c } = client([
    reply(200, answer('a')),
    reply(200, answer('b', { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 300 } })),
  ]);

  await c.complete('s', 'u');
  await c.complete('s', 'u');

  assert.deepEqual(c.usage(), { calls: 2, inputTokens: 110, outputTokens: 345 });
});

test('Gemini - refuses to start without a key', () => {
  assert.throws(() => createGeminiClient({ apiKey: '', model: 'm' }), /GEMINI_API_KEY/);
});

test('Gemini - a request that never answers is cut off and reported, not hung', async () => {
  const hang = () => new Promise(() => {});
  const c = createGeminiClient({ apiKey: KEY, model: 'm', fetchImpl: hang, timeoutMs: 20, retry: { retries: 0 }, ...noWait() });

  await assert.rejects(() => c.complete('s', 'u'), (err) => err instanceof PipelineAbort && /Could not reach Gemini/.test(err.message));
});

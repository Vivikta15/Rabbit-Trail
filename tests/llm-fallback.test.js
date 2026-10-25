const test = require('node:test');
const assert = require('node:assert/strict');

const { createFallbackClient } = require('../dist/lib/pipeline/fallback-client.js');
const { ModelUnavailable, PipelineAbort, AuthError } = require('../dist/lib/pipeline/http.js');
const { createGeminiClient } = require('../dist/lib/pipeline/gemini-client.js');
const { loadLlmConfig } = require('../dist/lib/config/provider.js');
const { needsStoryToday } = require('../dist/lib/pipeline/daily.js');

const gemKey = () => 'AIza' + 'Q'.repeat(30);
const named = (model, behaviour) => {
  const calls = [];
  let answered = 0; // like the real clients, only a call that got an answer is counted
  return {
    model,
    calls,
    client: {
      usage: () => ({ calls: answered, inputTokens: answered * 10, outputTokens: answered * 5 }),
      async complete(system, user) {
        calls.push(user);
        const out = behaviour(calls.length);
        answered += 1;
        return out;
      },
    },
  };
};
const ok = (text) => () => text;
const fails = (error) => () => {
  throw error;
};

// ---- falling back to the next model -----------------------------------------------------------------------------------

test('Fallback - the first model answers when it can', async () => {
  const a = named('a', ok('from a'));
  const b = named('b', ok('from b'));

  const llm = createFallbackClient([a, b]);

  assert.equal(await llm.complete('s', 'u'), 'from a');
  assert.equal(b.calls.length, 0);
});

test('Fallback - a model that is out of quota or busy hands over to the next, and the answer still comes back', async () => {
  const lines = [];
  const a = named('a', fails(new ModelUnavailable('a is busy (503)', false)));
  const b = named('b', ok('from b'));

  const llm = createFallbackClient([a, b], (m) => lines.push(m));

  assert.equal(await llm.complete('s', 'u'), 'from b');
  assert.ok(lines.some((l) => /a/.test(l) && /b/.test(l)), 'the switch is announced in the log');
});

test('Fallback - a model whose daily allowance is gone is not asked again this run, but a busy one is', async () => {
  const quota = named('quota', fails(new ModelUnavailable('daily limit', true)));
  const busy = named('busy', (n) => (n === 1 ? fails(new ModelUnavailable('503', false))() : 'busy answered'));
  const last = named('last', ok('last answered'));

  const llm = createFallbackClient([quota, busy, last]);
  await llm.complete('s', 'one');
  await llm.complete('s', 'two');

  assert.equal(quota.calls.length, 1, 'the spent model was tried once, then skipped');
  assert.equal(busy.calls.length, 2, 'a busy model gets another chance');
});

test('Fallback - when every model is unavailable the run stops with a clear reason', async () => {
  const a = named('a', fails(new ModelUnavailable('a: daily limit used up', true)));
  const b = named('b', fails(new ModelUnavailable('b is busy (503)', false)));

  const llm = createFallbackClient([a, b]);

  await assert.rejects(() => llm.complete('s', 'u'), (err) => err instanceof PipelineAbort && /a: daily limit/.test(err.message) && /b is busy/.test(err.message));
});

test('Fallback - a rejected key or a bad answer is not hidden by switching models', async () => {
  const auth = named('a', fails(new AuthError('Google rejected the key (403)')));
  const next = named('b', ok('from b'));
  await assert.rejects(() => createFallbackClient([auth, next]).complete('s', 'u'), AuthError);
  assert.equal(next.calls.length, 0, 'a wrong key is the same on every model');

  const odd = named('a', fails(new Error('some bug')));
  await assert.rejects(() => createFallbackClient([odd, named('b', ok('x'))]).complete('s', 'u'), /some bug/);
});

test('Fallback - usage adds up across the models that were used', async () => {
  const a = named('a', fails(new ModelUnavailable('x', true)));
  const b = named('b', ok('ok'));

  const llm = createFallbackClient([a, b]);
  await llm.complete('s', 'u');

  assert.equal(llm.usage().calls, 1, 'only the call that answered counts: the refused one cost nothing');
  assert.equal(createFallbackClient([named('x', ok('y')), named('z', ok('y'))]).usage().calls, 0, 'nothing has been used yet');
});

test('Fallback - one model is simply that model', async () => {
  const a = named('a', ok('only'));
  assert.equal(await createFallbackClient([a]).complete('s', 'u'), 'only');
});

// ---- Gemini says which failures are about the model -------------------------------------------------------------------

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
const gemini = (status, body) => createGeminiClient({ apiKey: gemKey(), model: 'm', fetchImpl: async () => res(status, body), retry: { retries: 0 }, sleep: async () => {} });
const dailyBody = { error: { message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }] } };

test('Gemini - a spent daily allowance, an unknown model and an outage are all "this model is unavailable"', async () => {
  await assert.rejects(() => gemini(429, dailyBody).complete('s', 'u'), (e) => e instanceof ModelUnavailable && e.permanent === true);
  await assert.rejects(() => gemini(404, { error: { message: 'no such model' } }).complete('s', 'u'), (e) => e instanceof ModelUnavailable && e.permanent === true);
  await assert.rejects(() => gemini(503, {}).complete('s', 'u'), (e) => e instanceof ModelUnavailable && e.permanent === false);
});

test('Gemini - a rejected key is still a key problem, not a model problem', async () => {
  await assert.rejects(() => gemini(403, { error: { message: 'API key not valid' } }).complete('s', 'u'), (e) => e instanceof AuthError && !(e instanceof ModelUnavailable));
});

// ---- choosing several models ------------------------------------------------------------------------------------------

test('Config - a comma-separated model list becomes a main model and fallbacks, in order, without repeats', () => {
  const r = loadLlmConfig({ GEMINI_API_KEY: gemKey(), GEMINI_MODEL: ' gemini-3.6-flash , gemini-3.8-flash,gemini-3.6-flash ,, ' });

  assert.equal(r.ok, true);
  assert.equal(r.config.model, 'gemini-3.6-flash');
  assert.deepEqual(r.config.fallbackModels, ['gemini-3.8-flash']);
});

test('Config - the judge can have fallbacks too, and a single model needs none', () => {
  const r = loadLlmConfig({ GEMINI_API_KEY: gemKey(), GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_JUDGE_MODEL: 'gemini-3.5-flash-lite,gemini-3.6-flash' });

  assert.equal(r.config.judgeModel, 'gemini-3.5-flash-lite');
  assert.deepEqual(r.config.judgeFallbackModels, ['gemini-3.6-flash']);
  assert.deepEqual(r.config.fallbackModels ?? [], []);
});

test('Config - every model in a list must be a valid id, and the list is capped', () => {
  const bad = loadLlmConfig({ GEMINI_API_KEY: gemKey(), GEMINI_MODEL: 'good-model,bad model!' });
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some((p) => /GEMINI_MODEL/.test(p)));

  const many = loadLlmConfig({ GEMINI_API_KEY: gemKey(), GEMINI_MODEL: 'm1,m2,m3,m4,m5,m6' });
  assert.equal(many.ok, true);
  assert.equal(1 + many.config.fallbackModels.length, 4, 'at most four models are used');
});

// ---- skipping a day that already has its story ------------------------------------------------------------------------

const story = (date, id = date) => ({ id, date });

test('Daily - a story dated today means there is nothing to do', () => {
  assert.equal(needsStoryToday([story('2026-10-24'), story('2026-10-25')], '2026-10-25'), false);
});

test('Daily - no story for today means one is needed, however many older ones there are', () => {
  assert.equal(needsStoryToday([], '2026-10-25'), true);
  assert.equal(needsStoryToday([story('2026-10-23'), story('2026-10-24')], '2026-10-25'), true);
});

test('Daily - a story dated in the future does not count as today\'s', () => {
  assert.equal(needsStoryToday([story('2026-10-26')], '2026-10-25'), true);
});

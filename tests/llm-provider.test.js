const test = require('node:test');
const assert = require('node:assert/strict');

const { validateGeminiKey, describeGeminiKey, loadLlmConfig, DEFAULT_GEMINI_MODEL } = require('../dist/lib/config/provider.js');
const { createLlmClient } = require('../dist/lib/pipeline/llm-factory.js');

// Built by concatenation so no key-looking literal sits in the repo.
const gemKey = (tail = 'G'.repeat(33)) => 'AIza' + 'Sy' + tail;
const antKey = () => 'sk-ant-' + 'api03-' + 'K'.repeat(40);

// ---- Gemini key shape ------------------------------------------------------------------------------------------

test('Gemini key - accepts a normal key, ignoring stray whitespace and one pair of quotes', () => {
  const key = gemKey();

  assert.deepEqual(validateGeminiKey(key), { ok: true, key });
  assert.deepEqual(validateGeminiKey(`  ${key}\n`), { ok: true, key });
  assert.deepEqual(validateGeminiKey(`"${key}"`), { ok: true, key });
});

test('Gemini key - does not reject a well-formed key just because Google changes the prefix', () => {
  const future = 'AQ.' + 'x'.repeat(40);

  assert.equal(validateGeminiKey(future).ok, true);
});

test('Gemini key - rejects missing, placeholder, truncated and other vendors\' keys, each with a fix', () => {
  const cases = {
    missing: [undefined, /not set/i],
    blank: ['   ', /not set/i],
    placeholder: ['your-key-here', /placeholder/i],
    anthropic: [antKey(), /anthropic/i],
    supabase: ['sb_secret_' + 'x'.repeat(30), /supabase/i],
    jwt: ['eyJhbGciOi' + 'x'.repeat(40), /jwt|supabase|not a gemini/i],
    short: ['AIzaShort', /too short|incomplete/i],
    inner_space: [gemKey('G'.repeat(15) + ' ' + 'G'.repeat(15)), /space|line break/i],
  };
  for (const [name, [value, pattern]] of Object.entries(cases)) {
    const r = validateGeminiKey(value);
    assert.equal(r.ok, false, name);
    assert.match(r.problem, pattern, name);
  }
});

test('Gemini key - a problem message never echoes the key', () => {
  const r = validateGeminiKey('AIza' + 'Z'.repeat(8));

  assert.equal(r.ok, false);
  assert.equal(r.problem.includes('ZZZZ'), false);
});

test('Gemini key - describing it shows only the last four characters', () => {
  const shown = describeGeminiKey(gemKey('B'.repeat(29) + 'wxyz'));

  assert.match(shown, /wxyz$/);
  assert.equal(shown.includes('BBBBB'), false);
  assert.equal(shown.includes('Sy'), false);
});

// ---- choosing the provider -------------------------------------------------------------------------------------

test('Provider - only a Gemini key means Gemini, with its default model', () => {
  const r = loadLlmConfig({ GEMINI_API_KEY: gemKey() });

  assert.equal(r.ok, true);
  assert.equal(r.config.provider, 'gemini');
  assert.equal(r.config.apiKey, gemKey());
  assert.equal(r.config.model, DEFAULT_GEMINI_MODEL);
});

test('Provider - only an Anthropic key means Claude, with its default model', () => {
  const r = loadLlmConfig({ ANTHROPIC_API_KEY: antKey() });

  assert.equal(r.ok, true);
  assert.equal(r.config.provider, 'anthropic');
  assert.equal(r.config.model, 'claude-sonnet-5-5');
});

test('Provider - with both keys, LLM_PROVIDER decides, and without it that is an error, never a guess', () => {
  const both = { ANTHROPIC_API_KEY: antKey(), GEMINI_API_KEY: gemKey() };

  const ambiguous = loadLlmConfig(both);
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.problems.join(' '), /LLM_PROVIDER/);

  assert.equal(loadLlmConfig({ ...both, LLM_PROVIDER: 'gemini' }).config.provider, 'gemini');
  assert.equal(loadLlmConfig({ ...both, LLM_PROVIDER: 'anthropic' }).config.provider, 'anthropic');
  assert.equal(loadLlmConfig({ ...both, LLM_PROVIDER: 'GEMINI ' }).config.provider, 'gemini', 'case and spaces do not matter');
});

test('Provider - choosing a provider whose key is missing is an error, never a silent switch to the other', () => {
  const r = loadLlmConfig({ ANTHROPIC_API_KEY: antKey(), LLM_PROVIDER: 'gemini' });

  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /GEMINI_API_KEY/);
  assert.match(r.problems.join(' '), /setup:gemini/);
});

test('Provider - no key at all names both ways to set one up', () => {
  const r = loadLlmConfig({});

  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /setup:gemini/);
  assert.match(r.problems.join(' '), /setup:key/);
});

test('Provider - an unknown LLM_PROVIDER lists the valid ones', () => {
  const r = loadLlmConfig({ LLM_PROVIDER: 'openai', GEMINI_API_KEY: gemKey() });

  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /anthropic/);
  assert.match(r.problems.join(' '), /gemini/);
});

test('Provider - each provider reads only its own model setting', () => {
  const g = loadLlmConfig({ GEMINI_API_KEY: gemKey(), GEMINI_MODEL: 'gemini-2.5-flash', STORY_MODEL: 'claude-opus-5-5' });
  const a = loadLlmConfig({ ANTHROPIC_API_KEY: antKey(), GEMINI_MODEL: 'gemini-2.5-flash', STORY_MODEL: 'claude-opus-5-5' });

  assert.equal(g.config.model, 'gemini-2.5-flash');
  assert.equal(a.config.model, 'claude-opus-5-5');
});

test('Provider - a bad key and a bad model are reported together, without echoing the key', () => {
  const r = loadLlmConfig({ GEMINI_API_KEY: 'AIza' + 'Q'.repeat(6), GEMINI_MODEL: 'bad model!' });

  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 2);
  assert.equal(JSON.stringify(r).includes('QQQQQ'), false);
});

test('Provider - blank settings count as not set', () => {
  const r = loadLlmConfig({ ANTHROPIC_API_KEY: '', GEMINI_API_KEY: gemKey(), LLM_PROVIDER: '  ' });

  assert.equal(r.ok, true);
  assert.equal(r.config.provider, 'gemini');
});

// ---- building the client ---------------------------------------------------------------------------------------

test('Factory - builds the client for the chosen provider and passes the model through', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(url);
    const body = url.includes('googleapis')
      ? { candidates: [{ content: { parts: [{ text: 'hi from gemini' }] }, finishReason: 'STOP' }] }
      : { content: [{ type: 'text', text: 'hi from claude' }], stop_reason: 'end_turn' };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };

  const gemini = createLlmClient({ provider: 'gemini', apiKey: gemKey(), model: 'gemini-3.8-flash' }, { fetchImpl });
  const claude = createLlmClient({ provider: 'anthropic', apiKey: antKey(), model: 'claude-sonnet-5-5' }, { fetchImpl });

  assert.equal(await gemini.complete('s', 'u'), 'hi from gemini');
  assert.equal(await claude.complete('s', 'u'), 'hi from claude');
  assert.match(seen[0], /models\/gemini-3\.8-flash:generateContent/);
  assert.match(seen[1], /anthropic\.com/);
  assert.equal(gemini.usage().calls, 1);
});

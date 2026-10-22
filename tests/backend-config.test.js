const test = require('node:test');
const assert = require('node:assert/strict');

const { validateApiKey, describeKey, upsertEnvLine, readEnvValue } = require('../dist/lib/config/env.js');

// Built by concatenation so no real-looking key ever appears as one literal in the repo.
const fakeKey = (tail = 'A'.repeat(40)) => 'sk-ant-' + 'api03-' + tail;

test('API key - accepts a well-formed key, ignoring stray whitespace and one pair of quotes', () => {
  const key = fakeKey();

  assert.deepEqual(validateApiKey(key), { ok: true, key });
  assert.deepEqual(validateApiKey(`  ${key}\n`), { ok: true, key });
  assert.deepEqual(validateApiKey(`"${key}"`), { ok: true, key });
  assert.deepEqual(validateApiKey(`'${key}'`), { ok: true, key });
});

test('API key - rejects missing, truncated, placeholder and wrong-vendor keys with a fix, not a stack trace', () => {
  const cases = {
    undefined: [undefined, /not set/i],
    empty: ['   ', /not set/i],
    placeholder: ['your-key-here', /placeholder/i],
    angle: ['<your key>', /placeholder/i],
    openai: ['sk-' + 'proj-' + 'A'.repeat(40), /anthropic/i],
    truncated: [fakeKey('short'), /too short|incomplete/i],
    inner_space: [fakeKey('A'.repeat(20) + ' ' + 'A'.repeat(20)), /space|line break/i],
    newline: [fakeKey('A'.repeat(20) + '\n' + 'A'.repeat(20)), /space|line break/i],
  };

  for (const [name, [value, pattern]] of Object.entries(cases)) {
    const result = validateApiKey(value);
    assert.equal(result.ok, false, name);
    assert.match(result.problem, pattern, name);
  }
});

test('API key - a problem message never echoes the key itself', () => {
  const key = fakeKey('Z'.repeat(15));
  const result = validateApiKey(key);

  assert.equal(result.ok, false);
  assert.equal(result.problem.includes('ZZZZZ'), false);
});

test('API key - describeKey shows only the last four characters', () => {
  const shown = describeKey(fakeKey('B'.repeat(36) + 'wxyz'));

  assert.match(shown, /wxyz$/);
  assert.equal(shown.includes('BBBBB'), false);
  assert.equal(shown.includes('api03'), false);
});

test('Env file - adds the key to an empty or missing file', () => {
  assert.equal(upsertEnvLine('', 'ANTHROPIC_API_KEY', 'abc'), 'ANTHROPIC_API_KEY=abc\n');
});

test('Env file - keeps every other line and appends the key', () => {
  const before = '# my settings\nSTORY_MODEL=claude-sonnet-5-5\nSTORIES_DIR=C:\\data\n';

  assert.equal(upsertEnvLine(before, 'ANTHROPIC_API_KEY', 'abc'), before + 'ANTHROPIC_API_KEY=abc\n');
  assert.equal(upsertEnvLine('A=1', 'B', '2'), 'A=1\nB=2\n', 'adds the missing final newline first');
});

test('Env file - replaces an existing key in place and collapses duplicates', () => {
  const before = 'A=1\nANTHROPIC_API_KEY=old\nB=2\nANTHROPIC_API_KEY=older\n';

  assert.equal(upsertEnvLine(before, 'ANTHROPIC_API_KEY', 'new'), 'A=1\nANTHROPIC_API_KEY=new\nB=2\n');
});

test('Env file - leaves comments alone and preserves Windows line endings', () => {
  const before = '# ANTHROPIC_API_KEY=commented-out\r\nA=1\r\n';
  const after = upsertEnvLine(before, 'ANTHROPIC_API_KEY', 'abc');

  assert.equal(after, '# ANTHROPIC_API_KEY=commented-out\r\nA=1\r\nANTHROPIC_API_KEY=abc\r\n');
});

test('Env file - readEnvValue finds the active value and ignores comments', () => {
  const content = '# ANTHROPIC_API_KEY=nope\nANTHROPIC_API_KEY=real\n';

  assert.equal(readEnvValue(content, 'ANTHROPIC_API_KEY'), 'real');
  assert.equal(readEnvValue('# only=comment\n', 'only'), undefined);
  assert.equal(readEnvValue('', 'X'), undefined);
});

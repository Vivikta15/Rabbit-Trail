import path from 'node:path';

export const KEY_NAME = 'ANTHROPIC_API_KEY';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

const MIN_KEY_LENGTH = 40;

export type KeyCheck = { ok: true; key: string } | { ok: false; problem: string };

// Every problem message tells the reader what to do and never repeats the key back.
export function validateApiKey(raw: string | undefined): KeyCheck {
  let value = (raw ?? '').trim();
  if (!value) {
    return { ok: false, problem: `${KEY_NAME} is not set. Run "npm run setup:key" to add it.` };
  }
  if (/^(["']).*\1$/s.test(value)) value = value.slice(1, -1).trim();

  if (!value.startsWith('sk-ant-')) {
    if (/your|here|placeholder|example|xxxx|<.*>/i.test(value)) {
      return { ok: false, problem: `${KEY_NAME} is still a placeholder. Run "npm run setup:key" and paste your real key.` };
    }
    if (value.startsWith('sk-')) {
      return { ok: false, problem: 'That looks like an OpenAI-style key. This app needs an Anthropic key, which starts with "sk-ant-".' };
    }
    return { ok: false, problem: 'An Anthropic key starts with "sk-ant-". Check you copied the whole key from the Anthropic console.' };
  }
  if (/\s/.test(value)) {
    return { ok: false, problem: 'The key contains a space or line break. Paste only the key, on one line.' };
  }
  if (value.length < MIN_KEY_LENGTH) {
    return { ok: false, problem: 'The key looks incomplete (too short). Copy the whole key again.' };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return { ok: false, problem: 'The key contains characters a key never has. Copy it again without extra symbols.' };
  }
  return { ok: true, key: value };
}

// For messages: enough to recognise the key, nowhere near enough to use it.
export function describeKey(key: string): string {
  return `sk-ant-…${key.slice(-4)}`;
}

const lineEnding = (content: string) => (content.includes('\r\n') ? '\r\n' : '\n');
const activeAssignment = (name: string) => new RegExp(`^\\s*${name}\\s*=`);

// Sets NAME=value in the text of an env file: replaces the active line in place, drops duplicates, leaves
// every other line (comments included) and the file's line endings untouched.
export function upsertEnvLine(content: string, name: string, value: string): string {
  const eol = lineEnding(content);
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();

  const out: string[] = [];
  let written = false;
  for (const line of lines) {
    if (activeAssignment(name).test(line)) {
      if (!written) out.push(`${name}=${value}`);
      written = true;
    } else {
      out.push(line);
    }
  }
  if (!written) out.push(`${name}=${value}`);
  return out.join(eol) + eol;
}

export function readEnvValue(content: string, name: string): string | undefined {
  let found: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`));
    if (match) found = match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return found;
}

export interface AppConfig {
  apiKey: string;
  model: string;
  storiesDir: string;
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: string[] };

// Collects every problem in one pass so the reader fixes them together instead of one run at a time.
export function loadConfig(env: Record<string, string | undefined>, cwd: string): ConfigResult {
  const problems: string[] = [];

  const key = validateApiKey(env[KEY_NAME]);
  if (!key.ok) problems.push(key.problem);

  const model = (env.STORY_MODEL ?? '').trim() || DEFAULT_MODEL;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) {
    problems.push(`STORY_MODEL "${model}" is not a valid model id. Remove it to use ${DEFAULT_MODEL}.`);
  }

  if (problems.length > 0 || !key.ok) return { ok: false, problems };
  return {
    ok: true,
    config: { apiKey: key.key, model, storiesDir: env.STORIES_DIR || path.join(cwd, 'content', 'stories') },
  };
}

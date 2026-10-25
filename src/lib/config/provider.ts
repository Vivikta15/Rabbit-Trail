// Which AI service writes and checks the stories, and with which key and model. Claude (Anthropic) or Gemini
// (Google). The choice is explicit or unambiguous: with two keys on hand it is never guessed, and a chosen provider
// whose key is missing is an error rather than a quiet switch to the other one. Messages say what to do and never
// repeat a key.
import { DEFAULT_MODEL, validateApiKey } from './env';

export type Provider = 'anthropic' | 'gemini';

export const PROVIDERS: Provider[] = ['anthropic', 'gemini'];
// Google's newest stable Flash model at the time of writing. Override with GEMINI_MODEL.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export type GeminiKeyCheck = { ok: true; key: string } | { ok: false; problem: string };

const SETUP_GEMINI = 'Run "npm run setup:gemini" and paste your key at the hidden prompt.';

// Deliberately lenient about the prefix: Google has changed key formats before, and rejecting a real key would be
// worse than letting the live check (a tiny request) decide. It only refuses what is clearly not a Gemini key.
export function validateGeminiKey(raw: string | undefined): GeminiKeyCheck {
  let value = (raw ?? '').trim();
  if (/^(["']).*\1$/s.test(value)) value = value.slice(1, -1).trim();
  if (!value) return { ok: false, problem: `GEMINI_API_KEY is not set. ${SETUP_GEMINI}` };

  if (/^(your|<|\[)/i.test(value) || /(your[-_ ]?key|key[-_ ]?here|placeholder|example)/i.test(value)) {
    return { ok: false, problem: `GEMINI_API_KEY is still a placeholder. ${SETUP_GEMINI}` };
  }
  if (value.startsWith('sk-ant-')) return { ok: false, problem: 'That is an Anthropic (Claude) key, not a Gemini key. Get a Gemini key at aistudio.google.com/apikey.' };
  if (value.startsWith('sb_')) return { ok: false, problem: 'That is a Supabase key, not a Gemini key. Get a Gemini key at aistudio.google.com/apikey.' };
  if (value.startsWith('eyJ')) return { ok: false, problem: 'That looks like a JWT (for example a Supabase key), not a Gemini key. Get a Gemini key at aistudio.google.com/apikey.' };
  if (value.startsWith('sk-')) return { ok: false, problem: 'That looks like an OpenAI-style key, not a Gemini key. Get a Gemini key at aistudio.google.com/apikey.' };
  if (/\s/.test(value)) return { ok: false, problem: 'The key contains a space or line break. Paste only the key, on one line.' };
  if (value.length < 20) return { ok: false, problem: 'The key looks incomplete (too short). Copy the whole key again.' };
  if (!/^[A-Za-z0-9._~-]+$/.test(value)) return { ok: false, problem: 'The key contains characters a key never has. Copy it again without extra symbols.' };
  return { ok: true, key: value };
}

// For messages: enough to recognise the key, nowhere near enough to use it.
export function describeGeminiKey(key: string): string {
  return `${key.startsWith('AIza') ? 'AIza' : 'key'}…${key.slice(-4)}`;
}

export interface LlmConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  // Optional second model that only checks the draft. A different model keeps the writer from grading its own work,
  // and has its own request allowance.
  judgeModel?: string;
  // Models to try, in order, when the main one cannot answer (its daily allowance is spent, or it is busy).
  fallbackModels?: string[];
  judgeFallbackModels?: string[];
}

export type LlmConfigResult = { ok: true; config: LlmConfig } | { ok: false; problems: string[] };

const set = (v: string | undefined) => (v ?? '').trim().length > 0;
const MODEL_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_MODELS = 4;

// "a, b,a" -> ["a", "b"]: in order, without blanks or repeats, and no more than a few.
function parseModelList(raw: string | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const name = part.trim();
    if (name) seen.add(name);
  }
  return Array.from(seen);
}

// Checks a list from the settings and returns the first model, the fallbacks, and any problem found.
function readModels(name: string, raw: string | undefined, fallback: string | undefined, problems: string[]): { primary: string | undefined; fallbacks: string[] } {
  const all = parseModelList(raw);
  const bad = all.find((m) => !MODEL_SHAPE.test(m));
  if (bad) problems.push(`${name} "${bad.slice(0, 40)}" is not a valid model id. Remove it${fallback ? ` to use ${fallback}` : ' to let the main model check its own work'}.`);
  const used = all.slice(0, MAX_MODELS);
  return { primary: used[0], fallbacks: used.slice(1) };
}

export function loadLlmConfig(env: Record<string, string | undefined>): LlmConfigResult {
  const requested = (env.LLM_PROVIDER ?? '').trim().toLowerCase();
  const hasClaude = set(env.ANTHROPIC_API_KEY);
  const hasGemini = set(env.GEMINI_API_KEY);

  let provider: Provider;
  if (requested) {
    if (!PROVIDERS.includes(requested as Provider)) {
      return { ok: false, problems: [`LLM_PROVIDER "${requested.slice(0, 30)}" is not valid. Use "anthropic" (Claude) or "gemini" (Google).`] };
    }
    provider = requested as Provider;
  } else if (hasClaude && hasGemini) {
    return { ok: false, problems: ['Both an Anthropic and a Gemini key are set, so it is unclear which to use. Set LLM_PROVIDER to "gemini" or "anthropic" in .env.local.'] };
  } else if (hasGemini) {
    provider = 'gemini';
  } else if (hasClaude) {
    provider = 'anthropic';
  } else {
    return { ok: false, problems: ['No AI key is set. Run "npm run setup:gemini" (Google Gemini) or "npm run setup:key" (Anthropic Claude).'] };
  }

  const problems: string[] = [];
  let apiKey = '';
  let model: string;
  let judgeModel: string | undefined;
  let fallbackModels: string[] = [];
  let judgeFallbackModels: string[] = [];

  if (provider === 'gemini') {
    const key = validateGeminiKey(env.GEMINI_API_KEY);
    if (key.ok) apiKey = key.key;
    else problems.push(key.problem);
    const main = readModels('GEMINI_MODEL', env.GEMINI_MODEL, DEFAULT_GEMINI_MODEL, problems);
    model = main.primary ?? DEFAULT_GEMINI_MODEL;
    fallbackModels = main.fallbacks;
    const judge = readModels('GEMINI_JUDGE_MODEL', env.GEMINI_JUDGE_MODEL, undefined, problems);
    judgeModel = judge.primary;
    judgeFallbackModels = judge.fallbacks;
  } else {
    const key = validateApiKey(env.ANTHROPIC_API_KEY);
    if (key.ok) apiKey = key.key;
    else problems.push(key.problem);
    const main = readModels('STORY_MODEL', env.STORY_MODEL, DEFAULT_MODEL, problems);
    model = main.primary ?? DEFAULT_MODEL;
    fallbackModels = main.fallbacks;
    const judge = readModels('STORY_JUDGE_MODEL', env.STORY_JUDGE_MODEL, undefined, problems);
    judgeModel = judge.primary;
    judgeFallbackModels = judge.fallbacks;
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, config: { provider, apiKey, model, ...(fallbackModels.length > 0 && { fallbackModels }), ...(judgeModel && { judgeModel }), ...(judgeFallbackModels.length > 0 && { judgeFallbackModels }) } };
}

export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Claude (Anthropic)', gemini: 'Gemini (Google)' };

import path from 'node:path';
import { DEFAULT_MODEL, describeKey, KEY_NAME, validateApiKey } from '../config/env';
import { StoriesDirReport } from '../stories/catalog';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

// Everything the checks touch, handed in, so each check can be tested without a network or a disk.
export interface DoctorDeps {
  nodeVersion: string;
  env: Record<string, string | undefined>;
  cwd: string;
  envFileExists: boolean;
  pingWikipedia(): Promise<void>;
  pingAnthropic(config: { apiKey: string; model: string }): Promise<void>;
  inspectDir(dir: string): StoriesDirReport;
  ensureWritable(dir: string): void;
  lockState(dir: string): 'none' | 'held' | 'stale';
  staleTempFiles(dir: string): string[];
}

const SETUP_KEY_FIX = 'Run "npm run setup:key" and paste your key at the hidden prompt.';
const MIN_NODE_MAJOR = 22;

function redact(text: string, secret: string | undefined): string {
  return secret ? text.split(secret).join('[key]') : text;
}

export async function runDoctor(deps: DoctorDeps): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const add = (r: CheckResult) => results.push(r);
  const rawKey = deps.env[KEY_NAME];

  const major = Number(deps.nodeVersion.split('.')[0]);
  add(
    major >= MIN_NODE_MAJOR
      ? { name: 'Node version', status: 'pass', detail: `Node ${deps.nodeVersion}` }
      : { name: 'Node version', status: 'fail', detail: `Node ${deps.nodeVersion} is too old`, fix: `Install Node ${MIN_NODE_MAJOR} or newer from nodejs.org.` },
  );

  add(
    deps.envFileExists
      ? { name: 'Settings file', status: 'pass', detail: '.env.local found' }
      : rawKey
        ? { name: 'Settings file', status: 'pass', detail: 'no .env.local, but the key comes from the environment' }
        : { name: 'Settings file', status: 'warn', detail: '.env.local not found', fix: SETUP_KEY_FIX },
  );

  const key = validateApiKey(rawKey);
  add(
    key.ok
      ? { name: 'API key', status: 'pass', detail: `present (${describeKey(key.key)})` }
      : { name: 'API key', status: 'fail', detail: key.problem, fix: SETUP_KEY_FIX },
  );

  const model = (deps.env.STORY_MODEL ?? '').trim() || DEFAULT_MODEL;
  const modelOk = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model);
  add(
    modelOk
      ? { name: 'Model', status: 'pass', detail: deps.env.STORY_MODEL ? model : `${model} (default)` }
      : { name: 'Model', status: 'fail', detail: `"${model}" is not a valid model id`, fix: `Remove STORY_MODEL from .env.local to use ${DEFAULT_MODEL}.` },
  );

  if (key.ok && modelOk) {
    try {
      await deps.pingAnthropic({ apiKey: key.key, model });
      add({ name: 'Anthropic connection', status: 'pass', detail: `key accepted and ${model} answered` });
    } catch (err) {
      add({ name: 'Anthropic connection', status: 'fail', detail: redact((err as Error).message, key.key), fix: 'Check the key at console.anthropic.com, then run "npm run setup:key" again.' });
    }
  } else {
    add({ name: 'Anthropic connection', status: 'skip', detail: 'not tried until the key and model above are fixed' });
  }

  try {
    await deps.pingWikipedia();
    add({ name: 'Wikipedia connection', status: 'pass', detail: 'reachable' });
  } catch (err) {
    add({ name: 'Wikipedia connection', status: 'fail', detail: (err as Error).message, fix: 'Check your internet connection and try again.' });
  }

  const dir = deps.env.STORIES_DIR || path.join(deps.cwd, 'content', 'stories');
  try {
    deps.ensureWritable(dir);
    add({ name: 'Stories folder', status: 'pass', detail: `${dir} is writable` });
  } catch (err) {
    add({ name: 'Stories folder', status: 'fail', detail: `${dir}: ${(err as Error).message}`, fix: 'Choose a folder you can write to with STORIES_DIR in .env.local.' });
  }

  const report = deps.inspectDir(dir);
  if (report.problems.length > 0) {
    const listing = report.problems.map((p) => `${p.file}: ${p.reason}`).join('; ');
    add({ name: 'Story files', status: 'warn', detail: `${report.valid.length} usable, ${report.problems.length} unusable (${listing})`, fix: 'Repair or delete those files. The feed ignores them in the meantime.' });
  } else {
    add({ name: 'Story files', status: 'pass', detail: `${report.valid.length} generated stories (plus the built-in one)` });
  }

  const lock = deps.lockState(dir);
  add(
    lock === 'none'
      ? { name: 'Run lock', status: 'pass', detail: 'no run in progress' }
      : lock === 'held'
        ? { name: 'Run lock', status: 'warn', detail: 'a story run is in progress right now', fix: 'Wait for it to finish before starting another.' }
        : { name: 'Run lock', status: 'warn', detail: 'a crashed run left a lock behind', fix: 'Nothing to do: the next run takes it over.' },
  );

  const temps = deps.staleTempFiles(dir);
  add(
    temps.length === 0
      ? { name: 'Leftover temp files', status: 'pass', detail: 'none' }
      : { name: 'Leftover temp files', status: 'warn', detail: temps.join(', '), fix: 'Nothing to do: the next run removes them.' },
  );

  return results;
}

export function hasFailures(results: CheckResult[]): boolean {
  return results.some((r) => r.status === 'fail');
}

const LABEL: Record<CheckStatus, string> = { pass: '[ok]', fail: '[FAIL]', warn: '[warn]', skip: '[skip]' };

export function formatReport(results: CheckResult[]): string {
  const lines = results.flatMap((r) => [`${LABEL[r.status]} ${r.name}: ${r.detail}`, ...(r.fix && r.status !== 'pass' ? [`       Fix: ${r.fix}`] : [])]);
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  lines.push('', failed > 0 ? `${failed} problem${failed === 1 ? '' : 's'} to fix.` : warned > 0 ? 'Ready to go, with notes above.' : 'All good.');
  return lines.join('\n');
}

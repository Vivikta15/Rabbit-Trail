import { BackendChoice, chooseBackend, describeServiceKey } from '../config/backend';
import { DEFAULT_MODEL, describeKey, KEY_NAME, validateApiKey } from '../config/env';
import { StoryRepository } from '../stories/repository';

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
  openRepository(choice: Exclude<BackendChoice, { kind: 'error' }>): StoryRepository;
  // Only meaningful for local files: Supabase keeps its lock in the database.
  fileHousekeeping(dir: string): { lock: 'none' | 'held' | 'stale'; staleTemps: string[] };
}

const SETUP_KEY_FIX = 'Run "npm run setup:key" and paste your key at the hidden prompt.';
const SUPABASE_FIX = 'See DEPLOY.md, step 1: create the Supabase project, then set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
const MIN_NODE_MAJOR = 22;

function redact(text: string, secrets: string[]): string {
  return secrets.reduce<string>((acc, s) => (s ? acc.split(s).join('[key]') : acc), text);
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
        ? { name: 'Settings file', status: 'pass', detail: 'no .env.local, but the settings come from the environment' }
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
      add({ name: 'Anthropic connection', status: 'fail', detail: redact((err as Error).message, [key.key]), fix: 'Check the key at console.anthropic.com, then run "npm run setup:key" again.' });
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

  // ---- where stories live ----
  const choice = chooseBackend(deps.env, deps.cwd);
  let repo: StoryRepository | null = null;

  if (choice.kind === 'error') {
    add({ name: 'Story storage', status: 'fail', detail: choice.problems.join(' '), fix: SUPABASE_FIX });
  } else {
    repo = deps.openRepository(choice);
    add(
      choice.kind === 'supabase'
        ? { name: 'Story storage', status: 'pass', detail: `${repo.describe()}, key ${describeServiceKey(choice.serviceKey)}` }
        : {
            name: 'Story storage',
            status: 'warn',
            detail: `${repo.describe()} (fine for development, but the website cannot keep files)`,
            fix: 'For the deployed site, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see DEPLOY.md).',
          },
    );
  }

  let accessOk = false;
  if (repo) {
    try {
      add({ name: 'Storage access', status: 'pass', detail: redact(await repo.verify(), choice.kind === 'supabase' ? [choice.serviceKey] : []) });
      accessOk = true;
    } catch (err) {
      add({
        name: 'Storage access',
        status: 'fail',
        detail: redact((err as Error).message, choice.kind === 'supabase' ? [choice.serviceKey] : []),
        fix: choice.kind === 'supabase' ? 'Fix the Supabase setting named above, then run "npm run doctor" again.' : 'Choose a folder you can write to with STORIES_DIR.',
      });
    }
  } else {
    add({ name: 'Storage access', status: 'skip', detail: 'not tried until the storage settings are fixed' });
  }

  if (repo && accessOk) {
    try {
      const report = await repo.list();
      if (report.problems.length > 0) {
        const listing = report.problems.map((p) => `${p.file}: ${p.reason}`).join('; ');
        add({ name: 'Stored stories', status: 'warn', detail: `${report.valid.length} usable, ${report.problems.length} unusable (${listing})`, fix: 'Repair or delete those records. The feed ignores them in the meantime.' });
      } else {
        add({ name: 'Stored stories', status: 'pass', detail: `${report.valid.length} stored (plus the built-in one)` });
      }
    } catch (err) {
      add({ name: 'Stored stories', status: 'fail', detail: (err as Error).message });
    }
  } else {
    add({ name: 'Stored stories', status: 'skip', detail: 'not read until storage access works' });
  }

  if (choice.kind === 'file') {
    const { lock, staleTemps } = deps.fileHousekeeping(choice.dir);
    add(
      lock === 'none'
        ? { name: 'Run lock', status: 'pass', detail: 'no run in progress' }
        : lock === 'held'
          ? { name: 'Run lock', status: 'warn', detail: 'a story run is in progress right now', fix: 'Wait for it to finish before starting another.' }
          : { name: 'Run lock', status: 'warn', detail: 'a crashed run left a lock behind', fix: 'Nothing to do: the next run takes it over.' },
    );
    add(
      staleTemps.length === 0
        ? { name: 'Leftover temp files', status: 'pass', detail: 'none' }
        : { name: 'Leftover temp files', status: 'warn', detail: staleTemps.join(', '), fix: 'Nothing to do: the next run removes them.' },
    );
  } else {
    add({ name: 'Run lock', status: 'pass', detail: 'kept in the database and released automatically if a run dies' });
    add({ name: 'Leftover temp files', status: 'pass', detail: 'not applicable: stories are written to the database, not to files' });
  }

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

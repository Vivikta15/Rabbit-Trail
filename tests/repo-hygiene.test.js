const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

// Everything git tracks, plus new files it would pick up on the next commit (gitignored files are excluded).
function committableFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf-8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return null; // not a git checkout; the guards below skip rather than pass falsely
  }
}

const files = committableFiles();
const skip = files === null ? 'not a git checkout' : false;

// Anthropic keys, Supabase secret keys, and Supabase's older JWT-style keys (the service_role key is one).
const KEY_PATTERNS = [/sk-ant-[A-Za-z0-9_-]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/];

test('Secrets - no file that would be committed contains an Anthropic or Supabase key', { skip }, () => {
  const offenders = files.filter((f) => {
    try {
      const text = fs.readFileSync(path.join(root, f), 'utf-8');
      return KEY_PATTERNS.some((p) => p.test(text));
    } catch {
      return false; // deleted, or a binary that cannot be read as text
    }
  });

  assert.deepEqual(offenders, [], `a key appears in: ${offenders.join(', ')}`);
});

test('Secrets - the key patterns really do match keys, so the scan above cannot pass by accident', () => {
  assert.ok(KEY_PATTERNS[0].test('sk-ant-' + 'A'.repeat(30)));
  assert.ok(KEY_PATTERNS[1].test('sb_secret_' + 'A'.repeat(30)));
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.ok(KEY_PATTERNS[2].test(`${part({ alg: 'HS256', typ: 'JWT' })}.${part({ role: 'service_role', iss: 'supabase' })}.${'x'.repeat(30)}`));
  assert.equal(KEY_PATTERNS.some((p) => p.test('just some ordinary text with sk-ant- and sb_secret_ mentioned')), false);
});

test('Secrets - no real .env file would be committed (only .env.example)', { skip }, () => {
  const envFiles = files.filter((f) => /(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example'));

  assert.deepEqual(envFiles, []);
});

test('Secrets - .env.example documents the settings and holds no real value', () => {
  const text = fs.readFileSync(path.join(root, '.env.example'), 'utf-8');

  assert.match(text, /ANTHROPIC_API_KEY=/);
  assert.match(text, /STORY_MODEL/);
  assert.match(text, /STORIES_DIR/);
  assert.match(text, /SUPABASE_URL=/);
  assert.match(text, /SUPABASE_SERVICE_ROLE_KEY=/);
  assert.equal(KEY_PATTERNS.some((p) => p.test(text)), false);
  for (const name of ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.match(text, new RegExp(`^${name}=\\s*$`, 'm'), `the example ${name} line must be empty`);
  }
});

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test('Secrets - browser code never imports the modules that handle the API key or touch the disk', () => {
  const serverOnly = /from\s+['"][^'"]*\/(lib\/(pipeline|config|doctor|db)|lib\/stories\/(catalog|file-repository|supabase-repository|get-repository|import|validate-for-save))(\/[^'"]*)?['"]/;
  const clientFiles = sourceFiles(path.join(root, 'src')).filter((f) => /^\s*['"]use client['"]/.test(fs.readFileSync(f, 'utf-8')));

  assert.ok(clientFiles.length > 5, 'expected to find the client components');
  const offenders = clientFiles.filter((f) => serverOnly.test(fs.readFileSync(f, 'utf-8'))).map((f) => path.relative(root, f));

  assert.deepEqual(offenders, [], `client code must not import server-only modules: ${offenders.join(', ')}`);
});

test('Secrets - the key is never exposed to the browser through a NEXT_PUBLIC_ variable', () => {
  const offenders = sourceFiles(path.join(root, 'src')).filter((f) => /NEXT_PUBLIC_[A-Z_]*(ANTHROPIC|API_KEY)/.test(fs.readFileSync(f, 'utf-8')));

  assert.deepEqual(offenders, []);
});

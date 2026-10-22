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

test('Secrets - no file that would be committed contains an Anthropic API key', { skip }, () => {
  const keyLike = /sk-ant-[A-Za-z0-9_-]{20,}/;
  const offenders = files.filter((f) => {
    try {
      return keyLike.test(fs.readFileSync(path.join(root, f), 'utf-8'));
    } catch {
      return false; // deleted, or a binary that cannot be read as text
    }
  });

  assert.deepEqual(offenders, [], `an API key appears in: ${offenders.join(', ')}`);
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
  assert.doesNotMatch(text, /sk-ant-[A-Za-z0-9_-]{20,}/);
  assert.match(text, /ANTHROPIC_API_KEY=\s*(\r?\n|$)/, 'the example key line must be empty');
});

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test('Secrets - browser code never imports the modules that handle the API key or touch the disk', () => {
  const serverOnly = /from\s+['"][^'"]*\/(lib\/(pipeline|config|doctor)|lib\/stories\/catalog)(\/[^'"]*)?['"]/;
  const clientFiles = sourceFiles(path.join(root, 'src')).filter((f) => /^\s*['"]use client['"]/.test(fs.readFileSync(f, 'utf-8')));

  assert.ok(clientFiles.length > 5, 'expected to find the client components');
  const offenders = clientFiles.filter((f) => serverOnly.test(fs.readFileSync(f, 'utf-8'))).map((f) => path.relative(root, f));

  assert.deepEqual(offenders, [], `client code must not import server-only modules: ${offenders.join(', ')}`);
});

test('Secrets - the key is never exposed to the browser through a NEXT_PUBLIC_ variable', () => {
  const offenders = sourceFiles(path.join(root, 'src')).filter((f) => /NEXT_PUBLIC_[A-Z_]*(ANTHROPIC|API_KEY)/.test(fs.readFileSync(f, 'utf-8')));

  assert.deepEqual(offenders, []);
});

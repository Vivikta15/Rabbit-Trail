const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');
const deploy = read('DEPLOY.md');
const workflow = read('.github/workflows/daily-stories.yml');

test('Docs - every npm command the guides tell you to run exists', () => {
  for (const [name, text] of [['README.md', readme], ['DEPLOY.md', deploy]]) {
    const mentioned = new Set([...text.matchAll(/npm run ([a-z][a-z0-9:_-]*)/g)].map((m) => m[1]));
    assert.ok(mentioned.size >= 3, `${name} should mention some commands`);
    for (const script of mentioned) assert.ok(pkg.scripts[script], `${name} mentions "npm run ${script}" but package.json has no such script`);
  }
});

test('Docs - the migration the deploy guide points at exists, and the guide says how to run it', () => {
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'migrations', '0001_stories.sql')));
  assert.match(deploy, /supabase\/migrations\/0001_stories\.sql/);
  assert.match(deploy, /SQL Editor/);
});

test('Docs - the reader accounts migration exists and the guide says to run it', () => {
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'migrations', '0002_reader_state.sql')));
  assert.match(deploy, /supabase\/migrations\/0002_reader_state\.sql/);
  assert.match(deploy, /Redirect URLs/);
});

test('Docs - every setting in .env.example is explained in the deploy guide', () => {
  const names = [...read('.env.example').matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);

  assert.ok(names.length >= 4);
  for (const name of names) assert.ok(deploy.includes(name), `DEPLOY.md never mentions ${name}`);
});

test('Docs - the deploy guide warns against exposing the keys to the browser', () => {
  assert.match(deploy, /NEXT_PUBLIC_/);
  assert.match(deploy, /public/i);
});

test('Workflow - runs daily and on demand, never overlaps, and cannot be abused to write to the repository', () => {
  assert.match(workflow, /schedule:\s*\n\s*- cron:/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress:\s*false/, 'a running generation must never be cancelled halfway');
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /timeout-minutes:\s*\d+/);
});

test('Workflow - gets its keys only from GitHub secrets and documents each one', () => {
  const used = new Set([...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]));

  // Both AI keys are wired (you set the one you use; the other stays empty), plus the two Supabase ones.
  assert.deepEqual([...used].sort(), ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
  for (const name of used) assert.ok(deploy.includes(name), `DEPLOY.md does not tell you to add the ${name} secret`);
  assert.doesNotMatch(workflow, /sk-ant-|sb_secret_|AIza/);
  assert.doesNotMatch(workflow, /echo[^\n]*secrets\./i, 'a secret must never be echoed into the log');
});

test('Workflow - the AI provider is a plain repository variable, documented, and passed to the job', () => {
  assert.match(workflow, /LLM_PROVIDER:\s*\$\{\{\s*vars\.LLM_PROVIDER\s*\}\}/);
  assert.match(deploy, /LLM_PROVIDER/);
  assert.match(deploy, /Variables/);
});

test('Workflow - refuses to write to the runner disk, installs from the lockfile, and checks setup before generating', () => {
  assert.match(workflow, /REQUIRE_SUPABASE:\s*'1'/);
  assert.match(workflow, /npm ci/);
  assert.ok(workflow.indexOf('npm run doctor') > -1);
  assert.ok(workflow.indexOf('npm run doctor') < workflow.indexOf('npm run stories:generate'), 'the doctor must run first');
});

test('Workflow - uses the same Node major version the project requires', () => {
  const required = Number(/(\d+)/.exec(pkg.engines.node)[1]);
  const inWorkflow = Number(/node-version:\s*(\d+)/.exec(workflow)[1]);

  assert.equal(inWorkflow, required);
});

test('Workflow - only calls scripts that exist', () => {
  for (const script of new Set([...workflow.matchAll(/npm run ([a-z][a-z0-9:_-]*)/g)].map((m) => m[1]))) {
    assert.ok(pkg.scripts[script], `workflow runs "npm run ${script}" which does not exist`);
  }
});

test('Project - the lockfile is committed and in step with package.json, so npm ci works on GitHub and Vercel', () => {
  const lock = JSON.parse(read('package-lock.json'));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const name of Object.keys(declared)) assert.ok(lock.packages[`node_modules/${name}`], `package-lock.json is missing ${name}; run npm install`);
});

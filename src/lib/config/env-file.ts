import fs from 'node:fs';
import { KEY_NAME, upsertEnvLine, validateApiKey } from './env';

// Writes the key into an env file without disturbing anything else in it. A key that does not pass validation is
// never written, and the file is replaced in one step so a crash cannot leave it half-written.
export function saveKeyToEnvFile(file: string, key: string): void {
  const checked = validateApiKey(key);
  if (!checked.ok) throw new Error(`That is not a usable Anthropic key. ${checked.problem}`);

  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf-8');
  } catch {
    // a missing file is fine; it is created below
  }

  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, upsertEnvLine(existing, KEY_NAME, checked.key), { mode: 0o600 });
  fs.renameSync(temp, file);
}

// Sets several NAME=value lines in one step (the file is replaced whole, or not at all). A name or value that
// could break the file's format, or inject another line, is refused before anything is written.
export function saveEnvValues(file: string, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid setting name "${name.slice(0, 40)}".`);
    if (/[\r\n]/.test(value)) throw new Error(`The value for ${name} contains a line break.`);
  }

  let content = '';
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch {
    // a missing file is fine; it is created below
  }
  for (const [name, value] of Object.entries(values)) content = upsertEnvLine(content, name, value);

  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.renameSync(temp, file);
}

const escapeForRegex =(s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// Would git ignore this file name (at the repository root) given the text of a .gitignore? Handles the plain
// name and * / ? wildcards, comments and negations, which covers how .env files are normally ignored.
export function isIgnoredByGit(gitignoreText: string, fileName: string): boolean {
  let ignored = false;
  for (const raw of gitignoreText.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    if (line.endsWith('/')) continue; // a directory rule never matches a file name
    line = line.replace(/^\//, '');

    const pattern = new RegExp(`^${escapeForRegex(line).replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
    if (pattern.test(fileName)) ignored = !negate;
  }
  return ignored;
}

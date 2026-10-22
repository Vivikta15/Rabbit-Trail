import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PipelineAbort } from './http';

const LOCK_NAME = '.generate.lock';
const DEFAULT_STALE_MS = 30 * 60 * 1000; // a run that has gone half an hour is assumed to have died
const UNREADABLE_STALE_MS = 10 * 60 * 1000;

export interface LockHandle {
  release(): void;
}

export interface LockOptions {
  now?: () => number;
  staleMs?: number;
  pid?: number;
  isProcessAlive?: (pid: number) => boolean;
}

interface Holder {
  pid: number;
  startedAt: number;
  owner?: string;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'; // exists, but not ours to signal
  }
}

function readHolder(file: string): Holder | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return typeof parsed?.pid === 'number' && typeof parsed?.startedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

// Looks at the lock without touching it: is a run in progress, did a crashed one leave it, or is there none?
export function lockState(dir: string, options: LockOptions = {}): 'none' | 'held' | 'stale' {
  const { now = Date.now, staleMs = DEFAULT_STALE_MS, isProcessAlive = processAlive } = options;
  const file = path.join(dir, LOCK_NAME);
  if (!fs.existsSync(file)) return 'none';

  const holder = readHolder(file);
  if (holder) return now() - holder.startedAt > staleMs || !isProcessAlive(holder.pid) ? 'stale' : 'held';
  try {
    return Date.now() - fs.statSync(file).mtimeMs > UNREADABLE_STALE_MS ? 'stale' : 'held';
  } catch {
    return 'none';
  }
}

// Only one story run may write to a folder at a time. Two overlapping runs would pick the same topic and
// spend model calls twice. A lock left behind by a crashed run is taken over once its process is gone or it
// is old; a lock held by a live, recent run is respected.
export function acquireLock(dir: string, options: LockOptions = {}): LockHandle {
  const { now = Date.now, staleMs = DEFAULT_STALE_MS, pid = process.pid, isProcessAlive = processAlive } = options;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, LOCK_NAME);
  const owner = randomUUID();

  const isStale = (holder: Holder | null): boolean => {
    if (holder) return now() - holder.startedAt > staleMs || !isProcessAlive(holder.pid);
    try {
      return Date.now() - fs.statSync(file).mtimeMs > UNREADABLE_STALE_MS; // fresh unreadable = another run mid-write
    } catch {
      return true; // vanished while we looked
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid, startedAt: now(), owner }));
      } finally {
        fs.closeSync(fd);
      }
      return {
        release() {
          if (readHolder(file)?.owner === owner) fs.rmSync(file, { force: true });
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }

    const holder = readHolder(file);
    if (!isStale(holder)) {
      const since = holder ? ` (started ${new Date(holder.startedAt).toISOString()}, process ${holder.pid})` : '';
      throw new PipelineAbort(`Another story run is already in progress${since}. If it crashed, delete ${file} and try again.`);
    }
    // Re-check just before removing, so we never delete a lock someone else just took.
    const again = readHolder(file);
    if ((again?.owner ?? null) === (holder?.owner ?? null) && (again?.startedAt ?? null) === (holder?.startedAt ?? null)) {
      fs.rmSync(file, { force: true });
    }
  }
  throw new PipelineAbort(`Could not take the run lock at ${file}. Try again in a moment.`);
}

// Shared plumbing for talking to outside services (Wikipedia, Anthropic): retries with backoff, timeouts, and
// the error types the orchestrator uses to tell "stop the whole run" from "this topic didn't work out".

// Stops the whole run: a bad key, an unknown model, or a service that stayed down. Continuing would only
// spend time and money on more attempts that cannot succeed, and must never blame the topic being tried.
export class PipelineAbort extends Error {}

// This model cannot answer right now, but another model might: its daily allowance is spent, it does not exist, or
// it is busy. `permanent` means it will not recover during this run, so it should not be asked again.
export class ModelUnavailable extends PipelineAbort {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
  }
}

// The service refused our credentials. Distinct from an outage so setup can say "that key is wrong".
export class AuthError extends PipelineAbort {}

// The model answered, but not usably (for example cut off at the token limit). Only this topic is affected.
export class ModelOutputError extends Error {}

export class HttpStatusError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs?: number) {
    super(message);
  }
}

export class TimeoutError extends Error {}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_RETRY_AFTER_MS = 60000;

export function isRetryable(err: unknown): boolean {
  if (err instanceof PipelineAbort || err instanceof ModelOutputError) return false;
  if (err instanceof HttpStatusError) return RETRYABLE_STATUS.has(err.status);
  return true; // timeouts and network failures ("fetch failed") are worth another try
}

export function retryAfterMs(header: string | null | undefined): number | undefined {
  if (header === null || header === undefined || !/^\d+$/.test(header.trim())) return undefined;
  return Number(header.trim()) * 1000;
}

export interface RetryOptions {
  retries?: number; // extra attempts after the first
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number; // injectable so tests are deterministic
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 1000, maxDelayMs = 30000, sleep = realSleep, random = Math.random } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;

      let delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      if (err instanceof HttpStatusError && err.retryAfterMs !== undefined) {
        delay = Math.max(delay, Math.min(err.retryAfterMs, MAX_RETRY_AFTER_MS));
      }
      await sleep(delay * (1 + 0.25 * random()));
    }
  }
}

// Races the request against a timer so a hung connection can never stall a run, even if the underlying
// fetch ignores the abort signal.
export async function fetchWithTimeout<R>(
  fetchImpl: (url: string, init: any) => Promise<R>,
  url: string,
  init: Record<string, unknown>,
  timeoutMs: number,
): Promise<R> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(`no response after ${timeoutMs} ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchImpl(url, { ...init, signal: controller.signal }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

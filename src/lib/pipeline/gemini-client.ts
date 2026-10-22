import { AuthError, fetchWithTimeout, HttpStatusError, ModelOutputError, PipelineAbort, RetryOptions, retryAfterMs, withRetry } from './http';
import { LlmClient, LlmUsage } from './llm-client';

interface GeminiFetchResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<any>;
  text(): Promise<string>;
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  // Gemini counts its hidden "thinking" tokens against this limit, so it needs room beyond the visible answer.
  maxTokens?: number;
  timeoutMs?: number;
  retry?: RetryOptions;
  sleep?: RetryOptions['sleep'];
  random?: RetryOptions['random'];
  fetchImpl?: (url: string, init: any) => Promise<GeminiFetchResponse>;
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// What Google says about a failed request. For quota errors it names the exact limit that was hit and how long to
// wait, which is what lets us tell "wait a few seconds" from "come back tomorrow".
export interface GeminiErrorInfo {
  message: string;
  quotaId?: string;
  quotaValue?: string;
  model?: string;
  retryDelayMs?: number;
}

// "36s", "44.5s", "83053s", "1m30s", "2h5m" -> milliseconds.
export function parseDuration(text: string): number | undefined {
  const units: Record<string, number> = { h: 3600000, m: 60000, s: 1000 };
  let total = 0;
  let found = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(h|m|s)/g)) {
    total += parseFloat(m[1]) * units[m[2]];
    found = true;
  }
  return found ? Math.round(total) : undefined;
}

export function parseGeminiError(body: string): GeminiErrorInfo {
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    return { message: '' };
  }
  const message = String(json?.error?.message ?? '').slice(0, 400);
  const details: any[] = Array.isArray(json?.error?.details) ? json.error.details : [];

  const retryInfo = details.find((d) => String(d?.['@type'] ?? '').endsWith('RetryInfo'));
  const violation = details.find((d) => String(d?.['@type'] ?? '').endsWith('QuotaFailure'))?.violations?.[0];

  const fromDetails = typeof retryInfo?.retryDelay === 'string' ? parseDuration(retryInfo.retryDelay) : undefined;
  const fromMessage = /retry in ([\d.]+)s/i.exec(message);

  return {
    message,
    quotaId: typeof violation?.quotaId === 'string' ? violation.quotaId : undefined,
    quotaValue: violation?.quotaValue !== undefined ? String(violation.quotaValue) : undefined,
    model: typeof violation?.quotaDimensions?.model === 'string' ? violation.quotaDimensions.model : undefined,
    retryDelayMs: fromDetails ?? (fromMessage ? Math.round(parseFloat(fromMessage[1]) * 1000) : undefined),
  };
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes >= 60) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minute${m === 1 ? '' : 's'}` : ''}`;
  }
  if (totalMinutes >= 1) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  return `${Math.max(1, Math.round(ms / 1000))} seconds`;
}

const isDailyLimit = (info: GeminiErrorInfo) => /PerDay/i.test(info.quotaId ?? '') || /per day/i.test(info.message);
const isPerMinuteLimit = (info: GeminiErrorInfo) => /PerMinute/i.test(info.quotaId ?? '');

function dailyLimitMessage(model: string, info: GeminiErrorInfo): string {
  const name = info.model ?? model;
  const amount = info.quotaValue ? `${info.quotaValue} requests per day` : 'its daily request allowance';
  const reset = info.retryDelayMs ? ` It resets in about ${formatDuration(info.retryDelayMs)} (at midnight Pacific time).` : ' It resets at midnight Pacific time.';
  return (
    `Gemini's free daily limit for "${name}" is used up (${amount} for that model).${reset} ` +
    'Each Gemini model has its own daily limit, so you can set GEMINI_MODEL to a different model to keep going now, or enable billing in Google AI Studio for much higher limits.'
  );
}

export function createGeminiClient({ apiKey, model, maxTokens = 16000, timeoutMs = 120000, retry, sleep, random, fetchImpl }: GeminiOptions): LlmClient {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Run "npm run setup:gemini" to add it.');
  }
  const doFetch = fetchImpl ?? ((fetch as unknown) as NonNullable<GeminiOptions['fetchImpl']>);
  const usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const retryOptions: RetryOptions = { retries: 3, baseDelayMs: 2000, maxDelayMs: 30000, ...retry, ...(sleep && { sleep }), ...(random && { random }) };
  // The model name is part of the URL path, so it is encoded: it can never add path segments or a query.
  const url = `${BASE}/${encodeURIComponent(model)}:generateContent`;

  return {
    usage: () => ({ ...usage }),

    async complete(system, user) {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      });
      // The key travels in a header, never in the URL, so it cannot end up in logs or proxy records.
      const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };

      let res: GeminiFetchResponse;
      try {
        res = await withRetry(async () => {
          const r = await fetchWithTimeout(doFetch, url, { method: 'POST', headers, body }, timeoutMs);
          if (r.ok) return r;

          // Read Google's explanation once. A daily limit cannot be waited out, so it stops here (an abort is never
          // retried); anything else is retried, waiting as long as Google asks.
          const info = parseGeminiError(await r.text().catch(() => ''));
          if (r.status === 429 && isDailyLimit(info)) throw new PipelineAbort(dailyLimitMessage(model, info));
          throw Object.assign(new HttpStatusError(`status ${r.status}`, r.status, retryAfterMs(r.headers?.get('retry-after')) ?? info.retryDelayMs), { info });
        }, retryOptions);
      } catch (err) {
        if (err instanceof PipelineAbort) throw err;
        if (err instanceof HttpStatusError) {
          const info: GeminiErrorInfo = (err as HttpStatusError & { info?: GeminiErrorInfo }).info ?? { message: '' };

          if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(info.message))) {
            throw new AuthError(`Google rejected the Gemini API key (${err.status}). Run "npm run setup:gemini" to enter a working key. If the key is right, check that the Gemini API is enabled for its Google project.`);
          }
          if (err.status === 404) {
            throw new PipelineAbort(`Gemini does not know the model "${model}" (404)${info.message ? `: ${info.message}` : ''} Set GEMINI_MODEL to a current model, or remove it to use the default.`);
          }
          if (err.status === 429) {
            if (isPerMinuteLimit(info)) {
              const amount = info.quotaValue ? ` (${info.quotaValue} requests per minute)` : '';
              throw new PipelineAbort(`Gemini's per-minute limit for "${info.model ?? model}"${amount} was still reached after waiting. Please try again in a few minutes.`);
            }
            throw new PipelineAbort('Gemini says the rate or daily quota is used up (429). Wait a while (daily quotas reset at midnight Pacific time), set GEMINI_MODEL to a different model, or enable billing in Google AI Studio.');
          }
          if (err.status >= 500 || err.status === 408) {
            throw new PipelineAbort(`Gemini is busy or unavailable (${err.status}). Please try again later.`);
          }
          throw new PipelineAbort(`Gemini rejected the request (${err.status})${info.message ? `: ${info.message}` : ''}.`);
        }
        throw new PipelineAbort(`Could not reach Gemini (${(err as Error).message}). Check your connection and try again later.`);
      }

      const json = await res.json();
      usage.calls += 1;
      usage.inputTokens += Number(json?.usageMetadata?.promptTokenCount) || 0;
      usage.outputTokens += (Number(json?.usageMetadata?.candidatesTokenCount) || 0) + (Number(json?.usageMetadata?.thoughtsTokenCount) || 0);

      if (json?.promptFeedback?.blockReason) {
        throw new ModelOutputError(`Gemini declined to answer this request (${json.promptFeedback.blockReason}).`);
      }
      const candidate = json?.candidates?.[0];
      if (!candidate) throw new ModelOutputError('Gemini returned no answer.');
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new ModelOutputError('The model answer was cut off at the token limit, so it cannot be trusted.');
      }
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        throw new ModelOutputError(`Gemini stopped before finishing (${candidate.finishReason}).`);
      }

      // Hidden reasoning parts are marked `thought` and are not part of the answer.
      const text = (candidate.content?.parts ?? [])
        .filter((p: any) => typeof p?.text === 'string' && p.thought !== true)
        .map((p: any) => p.text)
        .join('');
      if (!text) throw new ModelOutputError('Gemini returned no text.');
      return text;
    },
  };
}

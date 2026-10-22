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

async function readMessage(res: GeminiFetchResponse): Promise<string> {
  try {
    const body = JSON.parse(await res.text());
    return String(body?.error?.message ?? '').slice(0, 300);
  } catch {
    return '';
  }
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
          if (!r.ok) throw Object.assign(new HttpStatusError(`status ${r.status}`, r.status, retryAfterMs(r.headers?.get('retry-after'))), { response: r });
          return r;
        }, retryOptions);
      } catch (err) {
        if (err instanceof HttpStatusError) {
          const response = (err as HttpStatusError & { response?: GeminiFetchResponse }).response;
          const message = response ? await readMessage(response) : '';

          if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(message))) {
            throw new AuthError(`Google rejected the Gemini API key (${err.status}). Run "npm run setup:gemini" to enter a working key. If the key is right, check that the Gemini API is enabled for its Google project.`);
          }
          if (err.status === 404) {
            throw new PipelineAbort(`Gemini does not know the model "${model}" (404). Set GEMINI_MODEL to a current model, or remove it to use the default.`);
          }
          if (err.status === 429) {
            throw new PipelineAbort('Gemini says the rate or daily quota is used up (429). Wait a while (daily quotas reset at midnight Pacific time), set GEMINI_MODEL to a different model, or enable billing in Google AI Studio.');
          }
          if (err.status >= 500 || err.status === 408) {
            throw new PipelineAbort(`Gemini is busy or unavailable (${err.status}). Please try again later.`);
          }
          throw new PipelineAbort(`Gemini rejected the request (${err.status})${message ? `: ${message}` : ''}.`);
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

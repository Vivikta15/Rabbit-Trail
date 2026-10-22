import { AuthError, fetchWithTimeout, HttpStatusError, ModelOutputError, PipelineAbort, RetryOptions, retryAfterMs, TimeoutError, withRetry } from './http';

export interface LlmUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmClient {
  complete(system: string, user: string): Promise<string>;
  usage?(): LlmUsage;
}

interface AnthropicFetchResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<any>;
  text(): Promise<string>;
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  retry?: RetryOptions;
  sleep?: RetryOptions['sleep'];
  random?: RetryOptions['random'];
  fetchImpl?: (url: string, init: any) => Promise<AnthropicFetchResponse>;
}

const API_URL = 'https://api.anthropic.com/v1/messages';

// What went wrong, in words, with what to do about it. Never includes the key.
async function describeRejection(res: AnthropicFetchResponse, model: string): Promise<string> {
  let message = '';
  try {
    const body = JSON.parse(await res.text());
    message = String(body?.error?.message ?? '').slice(0, 300);
  } catch {
    // the body was not JSON; fall back to the status alone
  }

  if (res.status === 401 || res.status === 403) {
    return `Anthropic rejected the API key (${res.status}). Run "npm run setup:key" to enter a working key.`;
  }
  if (res.status === 404) {
    return `Anthropic does not know the model "${model}" (404). Set STORY_MODEL to a model your key can use, or remove it to use the default.`;
  }
  return `Anthropic rejected the request (${res.status})${message ? `: ${message}` : ''}.`;
}

export function createAnthropicClient({ apiKey, model, maxTokens = 8000, timeoutMs = 120000, retry, sleep, random, fetchImpl }: AnthropicOptions): LlmClient {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Run "npm run setup:key" to add it.');
  }
  const doFetch = fetchImpl ?? ((fetch as unknown) as NonNullable<AnthropicOptions['fetchImpl']>);
  const usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const retryOptions: RetryOptions = { retries: 3, baseDelayMs: 2000, maxDelayMs: 30000, ...retry, ...(sleep && { sleep }), ...(random && { random }) };

  return {
    usage: () => ({ ...usage }),

    async complete(system, user) {
      const request = JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
      const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };

      let res: AnthropicFetchResponse;
      try {
        res = await withRetry(async () => {
          const r = await fetchWithTimeout(doFetch, API_URL, { method: 'POST', headers, body: request }, timeoutMs);
          if (!r.ok && r.status >= 400) {
            // Kept for the retry decision; the readable explanation is built once we know we are giving up.
            throw Object.assign(new HttpStatusError(`status ${r.status}`, r.status, retryAfterMs(r.headers?.get('retry-after'))), { response: r });
          }
          return r;
        }, retryOptions);
      } catch (err) {
        if (err instanceof HttpStatusError) {
          const response = (err as HttpStatusError & { response?: AnthropicFetchResponse }).response;
          if (err.status >= 500 || err.status === 429 || err.status === 408) {
            throw new PipelineAbort(`Anthropic is busy or unavailable (${err.status}). Please try again later.`);
          }
          const explanation = response ? await describeRejection(response, model) : `Anthropic rejected the request (${err.status}).`;
          throw err.status === 401 || err.status === 403 ? new AuthError(explanation) : new PipelineAbort(explanation);
        }
        if (err instanceof TimeoutError || err instanceof Error) {
          throw new PipelineAbort(`Could not reach Anthropic (${err.message}). Check your connection and try again later.`);
        }
        throw err;
      }

      const json = await res.json();
      usage.calls += 1;
      usage.inputTokens += Number(json?.usage?.input_tokens) || 0;
      usage.outputTokens += Number(json?.usage?.output_tokens) || 0;

      if (json?.stop_reason === 'max_tokens') {
        throw new ModelOutputError('The model answer was cut off at the token limit, so it cannot be trusted.');
      }
      const text = Array.isArray(json?.content)
        ? json.content.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text)).join('')
        : '';
      if (!text) throw new ModelOutputError('Anthropic returned no text.');
      return text;
    },
  };
}

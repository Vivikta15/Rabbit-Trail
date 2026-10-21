export interface LlmClient {
  complete(system: string, user: string): Promise<string>;
}

interface AnthropicFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<AnthropicFetchResponse>;
}

export function createAnthropicClient({ apiKey, model, maxTokens = 8000, fetchImpl }: AnthropicOptions): LlmClient {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Create a file named .env.local in the project root containing the line ANTHROPIC_API_KEY=<your key>, then run this again.');
  }
  const doFetch = fetchImpl ?? ((fetch as unknown) as NonNullable<AnthropicOptions['fetchImpl']>);

  return {
    async complete(system, user) {
      const res = await doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new Error(`Anthropic API error (${res.status}): ${detail}`);
      }
      const json = await res.json();
      const text = Array.isArray(json?.content)
        ? json.content.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text)).join('')
        : '';
      if (!text) throw new Error('Anthropic API returned no text');
      return text;
    },
  };
}

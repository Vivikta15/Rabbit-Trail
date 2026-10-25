import { ModelUnavailable, PipelineAbort } from './http';
import { LlmClient, LlmUsage } from './llm-client';

export interface NamedClient {
  model: string;
  client: LlmClient;
}

// Tries the models in order. A model that cannot answer (spent daily allowance, unknown, busy) hands over to the next,
// so one bad model does not cost a day's story. A model whose daily allowance is gone is not asked again this run.
// Anything else (a rejected key, a bad answer, a bug) is NOT hidden by switching models: it is thrown as it is.
export function createFallbackClient(clients: NamedClient[], log?: (message: string) => void): LlmClient {
  if (clients.length === 1) return clients[0].client;
  const spent = new Set<string>();

  return {
    usage(): LlmUsage {
      return clients.reduce<LlmUsage>(
        (total, { client }) => {
          const u = client.usage?.() ?? { calls: 0, inputTokens: 0, outputTokens: 0 };
          return { calls: total.calls + u.calls, inputTokens: total.inputTokens + u.inputTokens, outputTokens: total.outputTokens + u.outputTokens };
        },
        { calls: 0, inputTokens: 0, outputTokens: 0 },
      );
    },

    async complete(system, user) {
      const reasons: string[] = [];
      const candidates = clients.filter((c) => !spent.has(c.model));

      for (let i = 0; i < candidates.length; i++) {
        const { model, client } = candidates[i];
        try {
          return await client.complete(system, user);
        } catch (err) {
          if (!(err instanceof ModelUnavailable)) throw err;
          if (err.permanent) spent.add(model);
          reasons.push(`${model}: ${err.message}`);
          const next = candidates[i + 1];
          if (next) log?.(`  - ${model} is unavailable, trying ${next.model}`);
        }
      }

      const already = clients.filter((c) => spent.has(c.model) && !candidates.some((x) => x.model === c.model)).map((c) => `${c.model}: used up earlier in this run`);
      throw new PipelineAbort(`No model could answer. ${[...already, ...reasons].join(' | ')}`);
    },
  };
}

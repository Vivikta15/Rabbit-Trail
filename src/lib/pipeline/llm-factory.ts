import { LlmConfig } from '../config/provider';
import { createFallbackClient } from './fallback-client';
import { createGeminiClient } from './gemini-client';
import { RetryOptions } from './http';
import { createAnthropicClient, LlmClient } from './llm-client';

export interface LlmTuning {
  fetchImpl?: (url: string, init: any) => Promise<any>;
  retry?: RetryOptions;
  timeoutMs?: number;
  maxTokens?: number;
}

// One place that turns the chosen provider into a client, so the rest of the pipeline never knows which it is.
export function createLlmClient(config: LlmConfig, tuning: LlmTuning = {}): LlmClient {
  return config.provider === 'gemini'
    ? createGeminiClient({ apiKey: config.apiKey, model: config.model, ...tuning })
    : createAnthropicClient({ apiKey: config.apiKey, model: config.model, ...tuning });
}

// The writing model and, if one is configured, the model that checks its drafts. Each can have fallbacks, so one model
// being busy or out of its free allowance does not cost a day's story.
export function createStoryClients(config: LlmConfig, tuning: LlmTuning = {}, log?: (message: string) => void): { llm: LlmClient; judge?: LlmClient } {
  const chain = (models: string[]) => createFallbackClient(models.map((model) => ({ model, client: createLlmClient({ ...config, model }, tuning) })), log);

  const llm = chain([config.model, ...(config.fallbackModels ?? [])]);
  const needsOwnJudge = config.judgeModel && (config.judgeModel !== config.model || (config.judgeFallbackModels ?? []).length > 0);
  const judge = needsOwnJudge ? chain([config.judgeModel as string, ...(config.judgeFallbackModels ?? [])]) : undefined;
  return { llm, ...(judge && { judge }) };
}

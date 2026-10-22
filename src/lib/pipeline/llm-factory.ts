import { LlmConfig } from '../config/provider';
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

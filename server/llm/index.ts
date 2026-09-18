import type { LlmClient } from './client.js';
import { FakeLlmClient } from './fakeClient.js';
import { DeepSeekClient } from './deepseekClient.js';

/**
 * 按环境变量选择 LLM 实现：
 * 配置了 LLM_API_KEY → DeepSeek（真实）；否则 → Fake（确定性，离线/测试用）。
 */
export function createLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL) {
    return new DeepSeekClient({
      apiKey: env.LLM_API_KEY,
      baseUrl: env.LLM_BASE_URL,
      model: env.LLM_MODEL,
    });
  }
  return new FakeLlmClient();
}

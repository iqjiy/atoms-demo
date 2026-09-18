/** 统一 LLM 抽象（OpenAI 协议兼容，便于未来接 DeepSeek 等）。 */
export interface LlmRequest {
  /** 角色人设 system prompt */
  system: string;
  /** 用户/任务 prompt（含上游上下文） */
  prompt: string;
  maxTokens?: number;
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<string>;
  /** token 级流式（P3 SSE 用）；P2 可不实现 */
  stream?(req: LlmRequest): AsyncIterable<string>;
}

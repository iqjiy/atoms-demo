import type { LlmClient, LlmRequest } from './client.js';

export interface DeepSeekOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 注入 fetch 便于测试；默认全局 fetch */
  fetchImpl?: typeof fetch;
}

/**
 * DeepSeek 客户端（OpenAI 协议 /chat/completions，默认 deepseek-flash 最便宜档）。
 * 实现统一 LlmClient 接口，与 FakeLlmClient 可互换，编排器零改动。
 */
export class DeepSeekClient implements LlmClient {
  private fetchImpl: typeof fetch;
  constructor(private opts: DeepSeekOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private get url(): string {
    return `${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  private buildBody(req: LlmRequest, stream: boolean) {
    return {
      model: this.opts.model,
      stream,
      max_tokens: req.maxTokens ?? 16384,
      // 生成代码无需推理思考；关闭以避免 token 全耗在 reasoning_content 导致 content 为空
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    };
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.opts.apiKey}`,
    };
  }

  async complete(req: LlmRequest): Promise<string> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(req, false)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`DeepSeek HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('DeepSeek 响应缺少 content');
    }
    return content;
  }

  /** token 级流式（SSE data: 行解析），供 P3 逐字推送。 */
  async *stream(req: LlmRequest): AsyncIterable<string> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(req, true)),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      throw new Error(`DeepSeek stream HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const j = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 跳过非 JSON 心跳行
        }
      }
    }
  }
}

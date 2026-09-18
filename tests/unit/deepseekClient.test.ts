import { describe, it, expect, vi } from 'vitest';
import { DeepSeekClient } from '../../server/llm/deepseekClient.js';
import type { LlmRequest } from '../../server/llm/client.js';

const req: LlmRequest = { system: '你是工程师', prompt: '需求：x', maxTokens: 100 };

/** 构造一个假的 fetch，返回预设的 OpenAI 风格 JSON。 */
function fakeFetchReturning(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null,
  })) as unknown as typeof fetch;
}

describe('DeepSeekClient（OpenAI 协议，deepseek-flash）', () => {
  it('complete 发送正确请求并拼接 content', async () => {
    const fetchMock = fakeFetchReturning({
      choices: [{ message: { content: '<!DOCTYPE html>...' } }],
    });
    const client = new DeepSeekClient({
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      fetchImpl: fetchMock,
    });

    const out = await client.complete(req);
    expect(out).toBe('<!DOCTYPE html>...');

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe('deepseek-flash');
    expect(sent.messages[0]).toEqual({ role: 'system', content: '你是工程师' });
    expect(sent.messages[1].role).toBe('user');
    expect((init as RequestInit).headers as Record<string, string>)
      .toHaveProperty('Authorization', 'Bearer sk-test');
  });

  it('HTTP 非 200 时抛出带状态的错误', async () => {
    const fetchMock = fakeFetchReturning({ error: 'bad key' }, false, 401);
    const client = new DeepSeekClient({
      apiKey: 'sk-bad', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', fetchImpl: fetchMock,
    });
    await expect(client.complete(req)).rejects.toThrow(/401/);
  });

  it('响应无 content 时抛错（防护 LLM 输出异常）', async () => {
    const fetchMock = fakeFetchReturning({ choices: [{ message: {} }] });
    const client = new DeepSeekClient({
      apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', fetchImpl: fetchMock,
    });
    await expect(client.complete(req)).rejects.toThrow();
  });
});

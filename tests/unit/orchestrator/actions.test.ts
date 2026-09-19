import { describe, it, expect } from 'vitest';
import { specSystem, architectureSystem, codeSystem, specAction } from '../../../server/orchestrator/actions.js';
import type { LlmRequest } from '../../../server/llm/client.js';

describe('协作身份 prompt（修改2 P-A）', () => {
  it('架构师/工程师 system 含协作身份、不含机械承接模板', () => {
    expect(architectureSystem).toContain('协作流水线');
    expect(codeSystem).toContain('协作流水线');
    // ACK_RULES 的机械承接模板（以 `> ` 引用块呈现）必须被移除
    expect(architectureSystem).not.toContain('以 `> ` 引用块呈现');
    expect(codeSystem).not.toContain('以 `> ` 引用块呈现');
    expect(architectureSystem).not.toContain('协作要求');
    expect(codeSystem).not.toContain('协作要求');
  });

  it('产品经理 system 也含协作身份', () => {
    expect(specSystem).toContain('协作流水线');
  });

  it('仍保留产物纪律（不反问、Markdown）', () => {
    expect(specSystem).toContain('Markdown');
    expect(architectureSystem).toContain('Markdown');
    expect(codeSystem).toContain('Markdown');
    expect(codeSystem).toContain('需要我');
  });

  it('工程师仍保留多文件输出契约', () => {
    expect(codeSystem).toContain('多文件输出');
  });

  it('驳回轮：prompt 含上一轮产物+修改意见，system 用修订要求(无承接模板)', async () => {
    let captured: LlmRequest | undefined;
    const llm = {
      complete: async (req: LlmRequest) => { captured = req; return 'x'; },
    };
    await specAction.run({
      idea: '做个待办',
      upstream: '',
      feedback: '配色改深',
      prevContent: '旧产物',
      llm,
    });
    expect(captured).toBeDefined();
    expect(captured!.prompt).toContain('旧产物');
    expect(captured!.prompt).toContain('配色改深');
    expect(captured!.system).toContain('修订');
    // 驳回轮不带协作身份/承接模板
    expect(captured!.system).not.toContain('协作流水线');
    expect(captured!.system).not.toContain('引用块');
  });
});

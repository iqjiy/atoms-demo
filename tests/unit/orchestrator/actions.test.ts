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

  it('工程师 prompt 要求单个自包含 index.html（不再要求多文件拆分）', () => {
    expect(codeSystem).toContain('自包含');
    expect(codeSystem).not.toContain('多文件');   // 双份契约已删
    expect(codeSystem).not.toContain('style.css');  // 不再引导拆 css
  });

  it('工程师 prompt 禁止使用 ES module（防止组装后 import 报错致按钮失效）', () => {
    expect(codeSystem).toContain('禁止使用 ES module');
    expect(codeSystem).toContain('import/export');
    expect(codeSystem).toContain('type="module"');
  });

  it('工程师 prompt 要求 index.html 自包含（内联 css/js、零本地依赖、完整不省略）', () => {
    expect(codeSystem).toContain('自包含');
    expect(codeSystem).toContain('内联');
    expect(codeSystem).toContain('<style>');
    expect(codeSystem).toContain('<script>');
    expect(codeSystem).toContain('完整');
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

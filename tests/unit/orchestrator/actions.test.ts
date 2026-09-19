import { describe, it, expect } from 'vitest';
import { specSystem, architectureSystem, codeSystem } from '../../../server/orchestrator/actions.js';

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
});

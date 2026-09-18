import type { LlmClient, LlmRequest } from './client.js';

/**
 * 确定性 Fake LLM：按 system 角色返回固定内容，供 P2 编排逻辑测试与 CLI 跑通。
 * 真实 LLM（DeepSeek）后续实现同一 LlmClient 接口替换，编排器零改动。
 */
export class FakeLlmClient implements LlmClient {
  async complete(req: LlmRequest): Promise<string> {
    const idea = extractIdea(req.prompt);
    if (req.system.includes('产品经理')) {
      return `# 产品规格\n\n需求：${idea}\n\n## 功能\n- 核心功能闭环\n`;
    }
    if (req.system.includes('架构师')) {
      return `# 架构设计\n\n基于规格的简单单页架构\n\n## 结构\n- 单文件 HTML + 原生 JS\n`;
    }
    if (req.system.includes('工程师')) {
      return buildHtml(idea);
    }
    return `# 输出\n\n${idea}`;
  }
}

function extractIdea(prompt: string): string {
  const m = prompt.match(/需求[:：]\s*(.+)/);
  return m ? m[1].trim() : prompt.slice(0, 40);
}

function buildHtml(idea: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${escapeHtml(idea)}</title></head>
<body>
  <h1>${escapeHtml(idea)}</h1>
  <button id="btn">点击计数</button>
  <p>次数：<span id="count">0</span></p>
  <script>
    let n = 0;
    document.getElementById('btn').addEventListener('click', () => {
      document.getElementById('count').textContent = String(++n);
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

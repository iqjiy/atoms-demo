// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderStreamingMarkdown } from '../../src/lib/markdown.js';

describe('renderStreamingMarkdown：流式自愈渲染（未闭合块补全）', () => {
  it('未闭合 ``` 代码围栏被自愈，不残留裸围栏符号', () => {
    // 流式半截：奇数个 ```，未闭合
    const out = renderStreamingMarkdown('# 标题\n\n```js\nconst a = 1;');
    expect(out).not.toContain('```'); // 围栏被消化为 <code>
    expect(out).toContain('const a = 1;');
  });

  it('完整代码块正常渲染（回归）', () => {
    const out = renderStreamingMarkdown('```js\nlet x = 1;\n```');
    expect(out).toContain('let x = 1;');
    expect(out).toContain('<code');
  });

  it('标题/列表/加粗在流式中也能渲染（非纯文本）', () => {
    const out = renderStreamingMarkdown('## 架构\n\n- 要点一\n- 要点二\n\n**重点**');
    expect(out).toContain('<h2');
    expect(out).toContain('<li>');
    expect(out).toContain('<strong>');
  });

  it('空串/纯文本不报错', () => {
    expect(renderStreamingMarkdown('')).toBe('');
    expect(renderStreamingMarkdown('普通一句话')).toContain('普通一句话');
  });

  it('防 XSS 仍生效（script 被净化）', () => {
    const out = renderStreamingMarkdown('# t\n\n<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
  });
});

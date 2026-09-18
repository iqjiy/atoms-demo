import { describe, it, expect } from 'vitest';
import { extractHtml, isCompleteHtml, ensureHtml } from '../../../server/orchestrator/htmlGuard.js';

describe('extractHtml 提取纯 HTML', () => {
  it('剥离 markdown ```html 代码块包裹', () => {
    const raw = '```html\n<!DOCTYPE html>\n<html><body>hi</body></html>\n```';
    expect(extractHtml(raw)).toBe('<!DOCTYPE html>\n<html><body>hi</body></html>');
  });

  it('剥离说明文字前缀与后缀', () => {
    const raw = '以下是您需要的代码：\n<!DOCTYPE html>\n<html></html>\n希望对你有帮助';
    expect(extractHtml(raw)).toBe('<!DOCTYPE html>\n<html></html>');
  });

  it('已是纯 HTML 则原样返回', () => {
    const raw = '<!DOCTYPE html>\n<html><body>x</body></html>';
    expect(extractHtml(raw)).toBe(raw);
  });

  it('无 DOCTYPE 但有 <html> 也能提取', () => {
    const raw = '```\n<html><body>y</body></html>\n```';
    expect(extractHtml(raw)).toBe('<html><body>y</body></html>');
  });

  it('完全无 HTML 返回 null', () => {
    expect(extractHtml('这只是文字，没有标签')).toBeNull();
  });
});

describe('isCompleteHtml 闭合校验', () => {
  it('含 </html> 视为完整', () => {
    expect(isCompleteHtml('<!DOCTYPE html><html><body>x</body></html>')).toBe(true);
  });
  it('缺 </html> 视为不完整', () => {
    expect(isCompleteHtml('<!DOCTYPE html><html><body>x')).toBe(false);
  });
});

describe('ensureHtml 提纯+校验+修复+兜底', () => {
  it('正常 LLM 输出 → 提取出完整 HTML', () => {
    const raw = '好的：```html\n<!DOCTYPE html><html><body>app</body></html>\n```';
    const out = ensureHtml(raw, '回退标题');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('app');
    expect(out).not.toContain('```');
  });

  it('截断输出 → 修复补全 </html>', () => {
    const raw = '<!DOCTYPE html><html><body><button>hi</button>';
    const out = ensureHtml(raw, 'x');
    expect(out.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('完全垃圾输入 → 兜底模板（非空且可渲染）', () => {
    const out = ensureHtml('抱歉我无法生成', '我的应用');
    expect(out).toContain('<html');
    expect(out).toContain('</html>');
    expect(out).toContain('我的应用');
  });

  it('兜底模板自身是合法完整 HTML', () => {
    const out = ensureHtml('', '测试');
    expect(isCompleteHtml(out)).toBe(true);
  });
});

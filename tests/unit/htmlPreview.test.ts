import { describe, it, expect } from 'vitest';
import { extractHtmlForPreview } from '../../src/lib/htmlPreview.js';

describe('extractHtmlForPreview：预览提纯（去掉承接语/说明/```html 围栏）', () => {
  it('提取 ```html 围栏包裹的纯 HTML（含承接语前缀）', () => {
    const raw = '> 读到了规格，核心是一个扫雷。\n\n```html\n<!DOCTYPE html>\n<html><body>游戏</body></html>\n```\n\n希望对你有帮助';
    expect(extractHtmlForPreview(raw)).toBe('<!DOCTYPE html>\n<html><body>游戏</body></html>');
  });

  it('提取带说明前缀的 <html>…</html>（无 DOCTYPE）', () => {
    const raw = '说明文字\n\n<html><body>app</body></html>';
    expect(extractHtmlForPreview(raw)).toBe('<html><body>app</body></html>');
  });

  it('已是纯 HTML 原样返回', () => {
    const raw = '<!DOCTYPE html>\n<html><body>ok</body></html>';
    expect(extractHtmlForPreview(raw)).toBe(raw);
  });

  it('流式不完整（无闭合 </html>）返回 null，不渲染半成品', () => {
    const raw = '> 承接语\n\n```html\n<!DOCTYPE html>\n<html><body>半成';
    expect(extractHtmlForPreview(raw)).toBeNull();
  });

  it('纯说明文字（无 HTML 段）返回 null', () => {
    expect(extractHtmlForPreview('这只是一段说明，没有任何 HTML')).toBeNull();
  });

  it('承接语在前、HTML 在后：只取 HTML 部分', () => {
    const raw = '> 我先说两句承接。\n\n下面给出代码：\n<!DOCTYPE html><html><body>x</body></html>';
    expect(extractHtmlForPreview(raw)).toBe('<!DOCTYPE html><html><body>x</body></html>');
  });
});

/**
 * 前端预览提纯：从工程师的流式/最终输出中提取**纯 HTML**进 iframe，
 * 丢弃承接语、markdown 说明、```html 围栏（修问题1：预览被文档污染）。
 *
 * 与后端 htmlGuard.extractHtml 的区别：前端**更严格**——只有含完整 `</html>`
 * 才返回，否则返回 null（不渲染半成品；生成中由「生成中」占位承接）。
 */

/** 提取纯 HTML；提取不到完整 HTML（无 </html> 闭合）返回 null。 */
export function extractHtmlForPreview(raw: string): string | null {
  if (!raw) return null;
  // 去 markdown 代码块围栏
  const s = raw.replace(/```(?:html)?/gi, '');

  const doctypeIdx = s.search(/<!DOCTYPE\s+html>/i);
  const htmlIdx = s.search(/<html[\s>]/i);
  const start = doctypeIdx >= 0 ? doctypeIdx : htmlIdx;
  if (start < 0) return null;

  const end = s.search(/<\/html>/i);
  if (end < 0) return null; // 流式未闭合 → 不渲染半成品
  return s.slice(start, end + '</html>'.length).trim();
}

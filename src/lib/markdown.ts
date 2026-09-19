import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** 把 LLM 产出的 Markdown 渲染为净化后的 HTML（防 XSS）。 */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

/**
 * 流式自愈渲染（修问题2：流式中即渲染 markdown，而非先原文后渲染）。
 * 参考 streamdown 的 remend「未闭合块自愈」：流式半截的 ``` 代码围栏会让 marked
 * 把后续内容吞成纯文本/渲染错误，这里先把未闭合围栏补上再渲染。
 * 只自愈代码围栏（最高频且危害大）；行内 `**`/`` ` `` 未闭合保留原字符（安全优先）。
 */
export function renderStreamingMarkdown(md: string): string {
  return renderMarkdown(healUnclosedCodeFence(md));
}

/** 检测并补全未闭合的 ``` 代码围栏（奇数个 ``` 则在末尾补一个闭合）。容忍缩进围栏（列表内合法，review C7）。 */
function healUnclosedCodeFence(md: string): string {
  if (!md) return md;
  // 数围栏标记（``` 或 ~~~），含行首缩进（GFM 列表内代码块）；奇数表示未闭合
  const fences = md.match(/^[ \t]*(```|~~~)/gm);
  if (fences && fences.length % 2 === 1) {
    return md + '\n' + fences[fences.length - 1].trim(); // 用同一种围栏闭合
  }
  return md;
}

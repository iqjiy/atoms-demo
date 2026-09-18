import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** 把 LLM 产出的 Markdown 渲染为净化后的 HTML（防 XSS）。 */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

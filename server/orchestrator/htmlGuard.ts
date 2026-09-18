/**
 * htmlGuard：LLM 输出提纯与兜底（对应最高概率风险 R3）。
 * 四层防护：提取纯 HTML → 闭合校验 → 截断修复 → 内置兜底模板，保证预览永不为空。
 */

/** 提取纯 HTML：剥离 markdown 代码块与说明文字，截取 <!DOCTYPE html>…</html> 或 <html>…</html>。 */
export function extractHtml(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();

  // 去掉 markdown 代码块围栏
  s = s.replace(/```(?:html)?/gi, '');

  // 截取从 <!DOCTYPE html> 或 <html ...> / <html> 起，到最后一个 </html>
  const doctypeIdx = s.search(/<!DOCTYPE\s+html>/i);
  const htmlIdx = s.search(/<html[\s>]/i);
  const start = doctypeIdx >= 0 ? doctypeIdx : htmlIdx;
  if (start < 0) return null;

  const end = s.search(/<\/html>/i);
  if (end < 0) {
    // 未闭合：先截取起点之后全部，交给 repair
    return s.slice(start).trim() || null;
  }
  return s.slice(start, end + '</html>'.length).trim();
}

/** 闭合校验：含 </html> 视为结构完整。 */
export function isCompleteHtml(html: string): boolean {
  return /<\/html>\s*$/i.test(html.trim());
}

/** 截断修复：补齐未闭合的 body/html 标签。 */
export function repairHtml(raw: string): string | null {
  const extracted = extractHtml(raw);
  if (!extracted) return null;
  if (isCompleteHtml(extracted)) return extracted;
  let out = extracted;
  if (!/<\/body>/i.test(out)) out += '\n</body>';
  if (!/<\/html>/i.test(out)) out += '\n</html>';
  return out;
}

/** 内置兜底模板：LLM 彻底失败时，保证预览面板有可渲染产物。 */
export function fallbackHtml(title: string): string {
  const t = escapeHtml(title || '应用生成失败');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="flex min-h-screen items-center justify-center bg-slate-50">
  <div class="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow">
    <h1 class="text-xl font-semibold text-slate-800">${t}</h1>
    <p class="mt-3 text-sm text-slate-500">本次代码生成未产出有效结果，请点击左侧「生成应用」重试。</p>
  </div>
</body>
</html>`;
}

/** 提纯 + 校验 + 修复 + 兜底：保证返回可渲染的非空 HTML。 */
export function ensureHtml(raw: string, fallbackTitle: string): string {
  const repaired = repairHtml(raw);
  if (repaired && isCompleteHtml(repaired)) return repaired;
  if (repaired) return repaired; // 修复过即可用
  return fallbackHtml(fallbackTitle);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

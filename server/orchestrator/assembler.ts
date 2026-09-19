import type { ParsedFile } from './fileParser.js';

/**
 * 组装器：把 /src 的多文件（index.html + style.css + app.js）内联为单个自包含 HTML，
 * 供现有 iframe srcdoc + storage shim 预览原样复用（docu-system P0 关键兼容技巧）。
 * 找不到 html 文件返回 null（调用方回退 ensureHtml 单文件兜底）。
 */
export function assembleHtml(files: ParsedFile[]): string | null {
  const htmlFile = files.find((f) => /(^|\/)index\.html$/i.test(f.path)) ?? files.find((f) => /\.html?$/i.test(f.path));
  if (!htmlFile) return null;

  const baseName = (p: string) => p.split('/').pop() ?? p;
  let out = htmlFile.content;

  for (const f of files) {
    if (f === htmlFile) continue;
    const name = baseName(f.path);
    if (/\.css$/i.test(name)) {
      // <link ... href="...style.css"> → <style>内容</style>
      out = out.replace(new RegExp(`<link[^>]*href=["'][^"']*${escapeRe(name)}["'][^>]*>`, 'i'), `<style>${f.content}</style>`);
    } else if (/\.js$/i.test(name)) {
      // <script src="...app.js"></script> → <script>内容</script>
      out = out.replace(new RegExp(`<script[^>]*src=["'][^"']*${escapeRe(name)}["'][^>]*>\\s*</script>`, 'i'), `<script>${f.content}</script>`);
    }
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

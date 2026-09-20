import type { ParsedFile } from './fileParser.js';

const EXTERNAL_URL_RE = /^(https?:)?\/\//i;

/**
 * 组装器：把 /src 的多文件（index.html + style.css + app.js）内联为单个自包含 HTML，
 * 供现有 iframe srcdoc + storage shim 预览原样复用（docu-system P0 关键兼容技巧）。
 * 找不到 html 文件返回 null（调用方回退 ensureHtml 单文件兜底）。
 *
 * 除「按标签引用内联」外，未被 index.html 直接引用的剩余本地 .js/.css 也会被内联：
 * 剩余 .js 追加到 </body> 前，剩余 .css 追加到 </head> 前（问题4-B：多文件预览死按钮根治）。
 * 外部 URL（http(s):// 或 // 开头，如 CDN）保留原标签不动。
 */
export function assembleHtml(files: ParsedFile[]): string | null {
  const htmlFile = files.find((f) => /(^|\/)index\.html$/i.test(f.path)) ?? files.find((f) => /\.html?$/i.test(f.path));
  if (!htmlFile) return null;

  const baseName = (p: string) => p.split('/').pop() ?? p;
  let out = htmlFile.content;
  const inlined = new Set<ParsedFile>();

  // 第一步：按标签引用内联（仅相对路径；外部 URL 不动）
  for (const f of files) {
    if (f === htmlFile) continue;
    const name = baseName(f.path);
    if (/\.css$/i.test(name)) {
      const re = new RegExp(`<link[^>]*href=["'](?!${EXTERNAL_URL_RE.source})[^"']*${escapeRe(name)}["'][^>]*>`, 'i');
      if (re.test(out)) {
        out = out.replace(re, `<style>${f.content}</style>`);
        inlined.add(f);
      }
    } else if (/\.js$/i.test(name)) {
      const re = new RegExp(`<script[^>]*src=["'](?!${EXTERNAL_URL_RE.source})[^"']*${escapeRe(name)}["'][^>]*>\\s*</script>`, 'i');
      if (re.test(out)) {
        out = out.replace(re, `<script>${f.content}</script>`);
        inlined.add(f);
      }
    }
  }

  // 第二步：剩余未被引用的本地文件追加内联（files 数组顺序 = LLM 产出顺序，通常依赖在前）
  const remainingJs: string[] = [];
  const remainingCss: string[] = [];
  for (const f of files) {
    if (f === htmlFile || inlined.has(f)) continue;
    const name = baseName(f.path);
    if (/\.js$/i.test(name)) remainingJs.push(`<script>${f.content}</script>`);
    else if (/\.css$/i.test(name)) remainingCss.push(`<style>${f.content}</style>`);
  }

  if (remainingCss.length) {
    const cssBlock = remainingCss.join('');
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${cssBlock}</head>`) : out + cssBlock;
  }
  if (remainingJs.length) {
    const jsBlock = remainingJs.join('');
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${jsBlock}</body>`) : out + jsBlock;
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 多文件解析（GPT-engineer 约定：路径行 + Markdown 围栏），docu-system P0。 */
export interface ParsedFile { path: string; content: string }

/** 解析「路径行 + ``` 围栏」为具名文件列表；解析不到返回 []（调用方回退单文件）。 */
export function parseFiles(raw: string, defaultDir: string): ParsedFile[] {
  if (!raw) return [];
  // 匹配「一行路径 + 紧跟一个围栏代码块」
  const re = /([^\n]+)\n\s*```[^\n]*\n([\s\S]*?)```/g;
  const files: ParsedFile[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const path = cleanPath(m[1], defaultDir);
    if (path) files.push({ path, content: m[2].replace(/\n$/, '') });
  }
  return files;
}

/** 清洗路径：去反引号/加粗/方括号/冒号；裸文件名归入 defaultDir。 */
function cleanPath(rawPath: string, defaultDir: string): string | null {
  let p = rawPath.trim().replace(/[*`\[\]:]/g, '').trim();
  if (!p || p.includes(' ')) return null; // 含空格说明不是路径行，是说明文字
  if (!p.includes('/')) p = `${defaultDir}/${p}`;
  return p;
}

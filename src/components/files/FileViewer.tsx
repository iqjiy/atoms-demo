import type { DocFile } from '../../../shared-types/index.js';
import { renderMarkdown } from '../../lib/markdown.js';

/** 只读文件查看：.md 渲染 markdown，代码/其他用等宽 pre。 */
export default function FileViewer({ file }: { file: DocFile | null }) {
  if (!file) return <div className="flex h-full items-center justify-center text-sm text-slate-400">选择左侧文件查看</div>;
  const isMd = file.path.endsWith('.md');
  return (
    <div className="h-full overflow-auto rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 font-mono text-xs text-slate-400">{file.path}</div>
      {isMd ? (
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(file.content) }} />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-700">{file.content}</pre>
      )}
    </div>
  );
}

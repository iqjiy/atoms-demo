import { useState } from 'react';
import type { DocFile } from '../../../shared-types/index.js';
import { groupFiles } from '../../lib/fileTree.js';

const DIR_LABEL: Record<string, string> = { pm: '产品需求、PRD、任务拆解等', architect: '架构设计、技术方案、流程图等', src: '代码实现、前端页面、脚本等' };

/** 右栏工作区文件树：目录卡片，点目录展开列出文件，点文件回调查看。 */
export default function FileTree({ files, activePath, onSelect }: {
  files: DocFile[]; activePath: string | null; onSelect: (f: DocFile) => void;
}) {
  const [openDir, setOpenDir] = useState<string | null>(null);
  const groups = groupFiles(files);
  if (groups.length === 0) {
    return <div className="p-3 text-xs text-slate-400">生成后这里会出现 /pm、/architect、/src 目录</div>;
  }
  return (
    <div className="space-y-2 p-2">
      {groups.map((g) => (
        <div key={g.dir} className="rounded-md border border-slate-200">
          <button type="button" onClick={() => setOpenDir(openDir === g.dir ? null : g.dir)}
            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50">
            <span className="font-mono text-sm text-slate-800">/{g.dir}</span>
            <span className="text-xs text-slate-400">{DIR_LABEL[g.dir] ?? ''}</span>
          </button>
          {openDir === g.dir && g.files.map((f) => (
            <button key={f.id} type="button" onClick={() => onSelect(f)}
              className={`block w-full truncate px-3 py-1 text-left font-mono text-xs ${f.path === activePath ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {f.path.split('/').pop()}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

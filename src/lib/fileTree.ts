import type { DocFile } from '../../shared-types/index.js';

export interface FileGroup { dir: string; files: DocFile[] }

const DIR_ORDER = ['pm', 'architect', 'src'];

/** 扁平文件列表按顶层目录分组（pm/architect/src 固定顺序，其余在后）。 */
export function groupFiles(files: DocFile[]): FileGroup[] {
  const byDir = new Map<string, DocFile[]>();
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.split('/')[0] : '';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(f);
  }
  for (const list of byDir.values()) list.sort((a, b) => a.path.localeCompare(b.path));
  return [...byDir.entries()]
    .map(([dir, list]) => ({ dir, files: list }))
    .sort((a, b) => {
      const ia = DIR_ORDER.indexOf(a.dir); const ib = DIR_ORDER.indexOf(b.dir);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}

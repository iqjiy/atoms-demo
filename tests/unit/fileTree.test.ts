import { describe, it, expect } from 'vitest';
import { groupFiles } from '../../src/lib/fileTree.js';
import type { DocFile } from '../../shared-types/index.js';

const f = (path: string): DocFile => ({ id: path, runId: 'r', iteration: 1, path, role: 'x', stage: 'code', content: '', createdAt: '' });

describe('fileTree：扁平文件按目录分组', () => {
  it('按顶层目录分组为 pm/architect/src', () => {
    const groups = groupFiles([f('src/index.html'), f('pm/spec.md'), f('src/app.js'), f('architect/arch.md')]);
    expect(groups.map((g) => g.dir)).toEqual(['pm', 'architect', 'src']);
    expect(groups.find((g) => g.dir === 'src')?.files.map((x) => x.path)).toEqual(['src/app.js', 'src/index.html']);
  });
  it('空列表返回空', () => {
    expect(groupFiles([])).toEqual([]);
  });
});

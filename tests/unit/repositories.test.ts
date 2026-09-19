import { describe, it, expect } from 'vitest';
import { createInMemoryRepos } from '../../server/db/repositories/memory.js';
import { repositoryContract } from './repositoryContract.js';

// 内存实现跑契约（单测，离线、快速）
repositoryContract(createInMemoryRepos);

describe('FilesRepository 契约（文档系统）', () => {
  it('save 多个文件后 listByRun 读回，按 path 排序', async () => {
    const repos = createInMemoryRepos();
    const proj = await repos.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
    const run = await repos.runs.create({ projectId: proj.id });
    await repos.files.save({ runId: run.id, iteration: 1, path: 'src/index.html', role: 'engineer', stage: 'code', content: '<html/>' });
    await repos.files.save({ runId: run.id, iteration: 1, path: 'pm/spec.md', role: 'pm', stage: 'spec', content: '# 规格' });
    await repos.files.save({ runId: run.id, iteration: 1, path: 'src/app.js', role: 'engineer', stage: 'code', content: 'js' });

    const files = await repos.files.listByRun(run.id);
    expect(files).toHaveLength(3);
    expect(files.map((f) => f.path)).toEqual(['pm/spec.md', 'src/app.js', 'src/index.html']);
    expect(files[0]).toMatchObject({ runId: run.id, role: 'pm', stage: 'spec' });
  });
});

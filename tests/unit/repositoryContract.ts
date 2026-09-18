import { describe, it, expect } from 'vitest';
import type { Repos } from '../../server/db/repositories/types.js';

/**
 * Repository 契约测试：同一组断言驱动多个实现（内存 / Postgres），
 * 保证实现行为一致、可互换。本文件只导出契约函数，不直接执行。
 */
export function repositoryContract(make: () => Repos): void {
  describe('ProjectRepository', () => {
    it('create 后可 getById 读回', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o1', title: 't', initialIdea: 'idea' });
      const got = await r.projects.getById(p.id);
      expect(got?.id).toBe(p.id);
      expect(got?.ownerId).toBe('o1');
      expect(got?.shareId).toBeTruthy();
    });

    it('listByOwner 只返回该 owner 的项目', async () => {
      const r = make();
      await r.projects.create({ ownerId: 'o1', title: 'a', initialIdea: 'i' });
      await r.projects.create({ ownerId: 'o2', title: 'b', initialIdea: 'i' });
      const mine = await r.projects.listByOwner('o1');
      expect(mine).toHaveLength(1);
      expect(mine[0].ownerId).toBe('o1');
    });

    it('shareId 唯一：getByShareId 可取回', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o1', title: 't', initialIdea: 'i' });
      const got = await r.projects.getByShareId(p.shareId);
      expect(got?.id).toBe(p.id);
    });
  });

  describe('RunRepository', () => {
    it('create 后 getById 读回，默认 status=running iteration=1', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const run = await r.runs.create({ projectId: p.id });
      const got = await r.runs.getById(run.id);
      expect(got?.status).toBe('running');
      expect(got?.iteration).toBe(1);
    });

    it('listByProject 按 startedAt 倒序', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const r1 = await r.runs.create({ projectId: p.id });
      await new Promise((r2) => setTimeout(r2, 5));
      const r2 = await r.runs.create({ projectId: p.id });
      const list = await r.runs.listByProject(p.id);
      expect(list.map((x) => x.id)).toEqual([r2.id, r1.id]);
    });

    it('setStatus 更新状态与当前阶段', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const run = await r.runs.create({ projectId: p.id });
      await r.runs.setStatus(run.id, 'awaiting_approval', 'architecture');
      const got = await r.runs.getById(run.id);
      expect(got?.status).toBe('awaiting_approval');
      expect(got?.currentStage).toBe('architecture');
    });
  });

  describe('MessageRepository', () => {
    it('append 自动 seq 递增', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const run = await r.runs.create({ projectId: p.id });
      const m1 = await r.messages.append({ runId: run.id, iteration: 1, role: 'pm', stage: 'spec', content: 'a', causeBy: 'RunSpecAction' });
      const m2 = await r.messages.append({ runId: run.id, iteration: 1, role: 'architect', stage: 'architecture', content: 'b', causeBy: 'RunArchitectureAction' });
      expect(m1.seq).toBe(1);
      expect(m2.seq).toBe(2);
    });

    it('listByRun 按 seq 升序返回', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const run = await r.runs.create({ projectId: p.id });
      await r.messages.append({ runId: run.id, iteration: 1, role: 'pm', stage: 'spec', content: 'a', causeBy: 'X' });
      await r.messages.append({ runId: run.id, iteration: 1, role: 'architect', stage: 'architecture', content: 'b', causeBy: 'Y' });
      const list = await r.messages.listByRun(run.id);
      expect(list.map((m) => m.content)).toEqual(['a', 'b']);
    });
  });

  describe('ArtifactRepository', () => {
    it('save 自动 version 递增', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const run = await r.runs.create({ projectId: p.id });
      const a1 = await r.artifacts.save({ runId: run.id, kind: 'html', filename: 'index.html', content: '<html/>' });
      const a2 = await r.artifacts.save({ runId: run.id, kind: 'html', filename: 'index.html', content: '<html>v2</html>' });
      expect(a1.version).toBe(1);
      expect(a2.version).toBe(2);
    });

    it('latestByRun 返回最新版本', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const run = await r.runs.create({ projectId: p.id });
      await r.artifacts.save({ runId: run.id, kind: 'html', filename: 'index.html', content: 'v1' });
      await r.artifacts.save({ runId: run.id, kind: 'html', filename: 'index.html', content: 'v2' });
      const latest = await r.artifacts.latestByRun(run.id);
      expect(latest?.content).toBe('v2');
    });
  });

  describe('ApprovalRepository', () => {
    it('record 决策，同一 gate 可多条（驳回后重跑）', async () => {
      const r = make();
      const p = await r.projects.create({ ownerId: 'o', title: 't', initialIdea: 'i' });
      const run = await r.runs.create({ projectId: p.id });
      await r.approvals.record({ runId: run.id, gate: 'architecture', decision: false, comment: '重做', iteration: 1 });
      await r.approvals.record({ runId: run.id, gate: 'architecture', decision: true, comment: null, iteration: 2 });
      const list = await r.approvals.listByRun(run.id);
      expect(list).toHaveLength(2);
      expect(list[0].decision).toBe(false);
      expect(list[1].decision).toBe(true);
    });
  });
}

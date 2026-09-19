import { describe, it, expect } from 'vitest';
import { ManualApprovalGate } from '../../../server/orchestrator/approvalGate.js';
import { RunManager } from '../../../server/orchestrator/runManager.js';

describe('ManualApprovalGate 可暂停闸门', () => {
  it('wait 挂起直到 resolveDecision 才解析为批准', async () => {
    const rm = new RunManager();
    const gate = new ManualApprovalGate(rm);

    let settled: { approved: boolean } | null = null;
    const p = gate.wait('r1', 'spec').then((d) => { settled = d; });

    // 微任务后仍未解析（Promise 挂起中）
    await Promise.resolve();
    expect(settled).toBeNull();

    rm.resolveDecision('r1', { approved: true });
    await p;
    expect(settled).toEqual({ approved: true });
  });

  it('resolveDecision 驳回时携带修改意见', async () => {
    const rm = new RunManager();
    const gate = new ManualApprovalGate(rm);
    const p = gate.wait('r1', 'architecture');
    rm.resolveDecision('r1', { approved: false, comment: '不要用这个功能' });
    await expect(p).resolves.toEqual({ approved: false, comment: '不要用这个功能' });
  });

  it('resolveDecision 对无挂起的 runId 返回 false（防御）', () => {
    const rm = new RunManager();
    expect(rm.resolveDecision('nope', { approved: true })).toBe(false);
  });
});

describe('code-review 修复（R4/R6）', () => {
  it('R4: registerDecision 记录挂起的 gate，可查询当前待审批的 gate', async () => {
    const rm = new RunManager();
    const gate = new ManualApprovalGate(rm);
    const p = gate.wait('r1', 'spec');
    expect(rm.pendingGate('r1')).toBe('spec');
    rm.resolveDecision('r1', { approved: true });
    await p;
    expect(rm.pendingGate('r1')).toBeNull();
  });

  it('R6: finish 时清理该 run 的 pendingApprovals（防泄漏）', async () => {
    const rm = new RunManager();
    rm.register('r1');
    const gate = new ManualApprovalGate(rm);
    void gate.wait('r1', 'spec'); // 挂起但不 await
    expect(rm.pendingGate('r1')).toBe('spec');
    rm.finish('r1');
    expect(rm.pendingGate('r1')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../../../server/orchestrator/runner.js';
import { FakeLlmClient } from '../../../server/llm/fakeClient.js';
import { AutoApproveGate } from '../../../server/orchestrator/approvalGate.js';
import { Checkpointer } from '../../../server/orchestrator/checkpointer.js';
import { createInMemoryRepos } from '../../../server/db/repositories/memory.js';
import type { OrchestratorEvent } from '../../../server/orchestrator/types.js';

function setup() {
  const repos = createInMemoryRepos();
  const events: OrchestratorEvent[] = [];
  return { repos, events };
}

describe('Orchestrator 三阶段接力', () => {
  it('按 requirement→spec→architecture→code 顺序产出消息', async () => {
    const { repos, events } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: (e) => events.push(e),
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    const stages = result.messages.map((m) => m.stage);
    expect(stages).toEqual(['requirement', 'spec', 'architecture', 'code']);
  });

  it('事件流包含 stage_start→stage_done 与 run_done，顺序正确', async () => {
    const { repos, events } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: (e) => events.push(e),
    });
    await orc.runProject({ idea: 'x' });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('stage_start');
    expect(types).toContain('stage_done');
    expect(types[types.length - 1]).toBe('run_done');
  });

  it('最终产出 HTML artifact 并落库，可读回', async () => {
    const { repos } = setup();
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: new AutoApproveGate(),
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: '做一个待办应用' });

    expect(result.artifact.kind).toBe('html');
    expect(result.artifact.content).toContain('<');
    // 落库可读回
    const msgs = await repos.messages.listByRun(result.runId);
    expect(msgs.length).toBeGreaterThanOrEqual(4);
    const art = await repos.artifacts.latestByRun(result.runId);
    expect(art?.content).toBe(result.artifact.content);
  });

  it('审批闸门驳回时不进入 code 阶段', async () => {
    const { repos } = setup();
    const rejectGate = { wait: async () => false };
    const orc = new Orchestrator({
      llm: new FakeLlmClient(),
      gate: rejectGate,
      checkpointer: new Checkpointer(repos),
      emit: () => {},
    });
    const result = await orc.runProject({ idea: 'x' });

    const stages = result.messages.map((m) => m.stage);
    expect(stages).not.toContain('code');
    expect(stages).toContain('architecture');
  });
});

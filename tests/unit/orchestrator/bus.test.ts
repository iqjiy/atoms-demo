import { describe, it, expect } from 'vitest';
import { MessageBus } from '../../../server/orchestrator/bus.js';
import type { AgentMessage } from '../../../shared-types/index.js';

function msg(causeBy: string, stage: AgentMessage['stage'], content = 'x'): AgentMessage {
  return {
    id: `id-${causeBy}`,
    runId: 'run1',
    artifactId: null,
    seq: 0,
    iteration: 1,
    role: 'pm',
    stage,
    content,
    causeBy,
    createdAt: new Date().toISOString(),
  };
}

describe('MessageBus 类型订阅路由', () => {
  it('publish 后仅 watch 命中 causeBy 的订阅者被唤醒', () => {
    const bus = new MessageBus();
    const hits: string[] = [];
    bus.watch(['RunSpecAction'], () => hits.push('architect'));
    bus.watch(['RunCodeAction'], () => hits.push('someoneElse'));

    bus.publish(msg('RunSpecAction', 'spec'));
    expect(hits).toEqual(['architect']);
  });

  it('未订阅该 causeBy 的订阅者不被触发', () => {
    const bus = new MessageBus();
    let called = 0;
    bus.watch(['RunCodeAction'], () => called++);
    bus.publish(msg('RunSpecAction', 'spec'));
    expect(called).toBe(0);
  });

  it('同一 causeBy 的多个订阅者都被触发', () => {
    const bus = new MessageBus();
    const hits: string[] = [];
    bus.watch(['RunSpecAction'], () => hits.push('a'));
    bus.watch(['RunSpecAction'], () => hits.push('b'));
    bus.publish(msg('RunSpecAction', 'spec'));
    expect(hits).toEqual(['a', 'b']);
  });

  it('新增订阅不改主流程：动态 watch 一个新角色即可接收', () => {
    const bus = new MessageBus();
    const hits: string[] = [];
    bus.publish(msg('RunSpecAction', 'spec')); // 之前无订阅
    bus.watch(['RunSpecAction'], () => hits.push('late'));
    bus.publish(msg('RunSpecAction', 'spec'));
    expect(hits).toEqual(['late']);
  });
});

describe('MessageBus 上下文裁剪', () => {
  it('contextFor 只返回指定阶段的产物，且按阶段标注', () => {
    const bus = new MessageBus();
    bus.publish(msg('RunRequirementAction', 'requirement', '做一个待办应用'));
    bus.publish(msg('RunSpecAction', 'spec', '## 规格 ...'));
    bus.publish(msg('RunArchitectureAction', 'architecture', '## 架构 ...'));

    const ctx = bus.contextFor(['requirement', 'spec']);
    expect(ctx).toContain('做一个待办应用');
    expect(ctx).toContain('## 规格');
    expect(ctx).not.toContain('## 架构');
  });

  it('contextFor 空数组返回空串', () => {
    const bus = new MessageBus();
    bus.publish(msg('RunSpecAction', 'spec', 's'));
    expect(bus.contextFor([])).toBe('');
  });

  it('同一阶段多次发布（驳回重跑）时，contextFor 只取最新一版', () => {
    const bus = new MessageBus();
    bus.publish(msg('RunRequirementAction', 'requirement', '做一个待办应用'));
    bus.publish(msg('RunSpecAction', 'spec', '规格 v1（被驳回）'));
    bus.publish(msg('RunSpecAction', 'spec', '规格 v2（修订后）'));

    const ctx = bus.contextFor(['requirement', 'spec']);
    expect(ctx).toContain('规格 v2（修订后）');
    expect(ctx).not.toContain('规格 v1（被驳回）');
  });
});

describe('MessageBus latestOfStage', () => {
  it('latestOfStage 返回该 stage 最新一版（驳回重跑后取新）', () => {
    const bus = new MessageBus();
    bus.publish({ ...msg('RunSpecAction', 'spec', 'v1'), iteration: 1 });
    bus.publish({ ...msg('RunSpecAction', 'spec', 'v2'), iteration: 2 });
    bus.publish(msg('RunCodeAction', 'code', 'c'));

    expect(bus.latestOfStage('spec')?.content).toBe('v2');
    expect(bus.latestOfStage('code')?.content).toBe('c');
    expect(bus.latestOfStage('architecture')).toBeUndefined();
  });
});

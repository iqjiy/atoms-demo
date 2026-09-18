import { describe, it, expect } from 'vitest';
import { initialState, reduceEvent, type TimelineState } from '../../src/lib/eventReducer.js';
import type { OrchestratorEvent } from '../../server/orchestrator/types.js';

const start = (role: 'pm' | 'architect' | 'engineer', stage: 'spec' | 'architecture' | 'code'): OrchestratorEvent => ({
  type: 'stage_start', role, stage, iteration: 1,
});

describe('eventReducer：OrchestratorEvent → UI 状态', () => {
  it('stage_start 新增激活中的阶段卡片', () => {
    let s: TimelineState = initialState();
    s = reduceEvent(s, start('pm', 'spec'));
    expect(s.stages).toHaveLength(1);
    expect(s.stages[0].stage).toBe('spec');
    expect(s.stages[0].status).toBe('running');
  });

  it('token 逐字追加到当前阶段文本', () => {
    let s = initialState();
    s = reduceEvent(s, start('pm', 'spec'));
    s = reduceEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: '# 规格' });
    s = reduceEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: ' V1' });
    expect(s.stages[0].text).toBe('# 规格 V1');
  });

  it('stage_done 标记阶段完成', () => {
    let s = initialState();
    s = reduceEvent(s, start('pm', 'spec'));
    s = reduceEvent(s, {
      type: 'stage_done',
      message: { stage: 'spec', content: '# 规格' } as never,
    });
    expect(s.stages[0].status).toBe('done');
  });

  it('stage_done 用最终内容替换流式文本（F-03 UI 与 DB 一致）', () => {
    let s = initialState();
    s = reduceEvent(s, start('pm', 'spec'));
    s = reduceEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: '正文。需要我展开吗？' });
    // 后端剥离反问尾巴后，message.content 是干净的
    s = reduceEvent(s, {
      type: 'stage_done',
      message: { stage: 'spec', content: '正文。' } as never,
    });
    expect(s.stages[0].text).toBe('正文。');
  });

  it('run_done 置整体完成并保存 artifact', () => {
    let s = initialState();
    s = reduceEvent(s, start('engineer', 'code'));
    s = reduceEvent(s, {
      type: 'run_done',
      runId: 'r1',
      artifact: { kind: 'html', filename: 'index.html', content: '<html/>' },
    });
    expect(s.done).toBe(true);
    expect(s.artifact?.content).toBe('<html/>');
  });

  it('error 记录错误信息', () => {
    let s = initialState();
    s = reduceEvent(s, { type: 'error', stage: 'code', message: 'LLM 失败', retryable: true });
    expect(s.error).toBe('LLM 失败');
  });

  it('完整接力序列：三阶段依次激活并完成', () => {
    let s = initialState();
    for (const [role, stage] of [['pm', 'spec'], ['architect', 'architecture'], ['engineer', 'code']] as const) {
      s = reduceEvent(s, start(role, stage));
      s = reduceEvent(s, { type: 'token', role, stage, delta: `${stage}-text` });
      s = reduceEvent(s, { type: 'stage_done', message: { stage, content: `${stage}-text` } as never });
    }
    expect(s.stages.map((x) => x.stage)).toEqual(['spec', 'architecture', 'code']);
    expect(s.stages.every((x) => x.status === 'done')).toBe(true);
    expect(s.stages[1].text).toBe('architecture-text');
  });
});

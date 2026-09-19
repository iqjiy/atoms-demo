import { describe, it, expect } from 'vitest';
import {
  initialChatState,
  reduceChatEvent,
  appendUserMessage,
  buildReplayState,
  markPendingStart,
  stageProgress,
  type ChatState,
  type ChatItem,
} from '../../src/lib/chatReducer.js';
import type { OrchestratorEvent } from '../../server/orchestrator/types.js';
import type { AgentMessage, Run } from '../../shared-types/index.js';

const start = (role: 'pm' | 'architect' | 'engineer', stage: 'spec' | 'architecture' | 'code', iteration = 1): OrchestratorEvent => ({
  type: 'stage_start', role, stage, iteration,
});

describe('chatReducer：聊天气泡流', () => {
  it('stage_start 产生左侧 agent 气泡；token 逐字累积', () => {
    let s: ChatState = initialChatState();
    s = reduceChatEvent(s, start('pm', 'spec'));
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ side: 'agent', role: 'pm', stage: 'spec', status: 'streaming' });
    s = reduceChatEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: '# 规格' });
    s = reduceChatEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: ' V1' });
    expect(s.items[0].text).toBe('# 规格 V1');
  });

  it('驳回重跑：同一阶段 iteration+1 产生**新气泡**而非覆盖（聊天流保留历史轮次）', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, start('pm', 'spec', 1));
    s = reduceChatEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: 'v1' });
    s = reduceChatEvent(s, { type: 'stage_done', message: { stage: 'spec', iteration: 1, content: 'v1' } as never });
    // 第 2 轮重跑 spec
    s = reduceChatEvent(s, start('pm', 'spec', 2));
    s = reduceChatEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: 'v2' });

    expect(s.items).toHaveLength(2);
    expect(s.items[0].iteration).toBe(1);
    expect(s.items[1].iteration).toBe(2);
    expect(s.items[0].text).toBe('v1');
    expect(s.items[1].text).toBe('v2');
  });

  it('approval_required 把该阶段最新一轮气泡标记为待审批（pendingApproval）', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, start('pm', 'spec', 1));
    s = reduceChatEvent(s, { type: 'stage_done', message: { stage: 'spec', iteration: 1, content: 'v1' } as never });
    s = reduceChatEvent(s, { type: 'approval_required', runId: 'r1', gate: 'spec', summary: '...' });
    expect(s.items[0].pendingApproval).toEqual({ gate: 'spec' });
  });

  it('新一轮 stage_start 清除上一轮同阶段气泡的待审批标记（决策已落地）', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, start('pm', 'spec', 1));
    s = reduceChatEvent(s, { type: 'approval_required', runId: 'r1', gate: 'spec', summary: '' });
    s = reduceChatEvent(s, start('pm', 'spec', 2)); // 驳回后重跑
    expect(s.items[0].pendingApproval).toBeNull();
  });

  it('appendUserMessage 追加右侧用户气泡（壳：纯展示，不触发任何事件）', () => {
    let s = initialChatState();
    s = appendUserMessage(s, '帮我改一下配色');
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ side: 'user', text: '帮我改一下配色', status: 'done' });
  });

  it('run_done 完成 code 气泡并存 artifact；done=true', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, start('engineer', 'code', 1));
    s = reduceChatEvent(s, {
      type: 'run_done', runId: 'r1',
      artifact: { kind: 'html', filename: 'index.html', content: '<html/>' },
    });
    expect(s.done).toBe(true);
    expect(s.artifact?.content).toBe('<html/>');
  });
});

describe('buildReplayState：关页/切换会话重放', () => {
  const msg = (stage: AgentMessage['stage'], iteration: number, content: string, role = 'pm'): AgentMessage => ({
    id: `${stage}-${iteration}`, runId: 'r1', artifactId: null, seq: 1, iteration,
    role, stage, content, causeBy: 'RunSpecAction', createdAt: new Date().toISOString(),
  });

  it('按历史消息重建聊天气泡（含多 iteration 轮次）', () => {
    const messages = [msg('spec', 1, '规格 v1'), msg('spec', 2, '规格 v2')];
    const run = { status: 'running' } as Run;
    const s = buildReplayState(messages, run, null);
    expect(s.items).toHaveLength(2);
    expect(s.items[0].text).toBe('规格 v1');
    expect(s.items[1].text).toBe('规格 v2');
    expect(s.items.every((i) => i.status === 'done')).toBe(true);
  });

  it('status=awaiting_approval 时，最后一条对应阶段气泡挂审批卡', () => {
    const messages = [msg('requirement', 1, '想法', 'coordinator'), msg('spec', 1, '规格', 'pm')];
    const run = { status: 'awaiting_approval', currentStage: 'spec' } as Run;
    const s = buildReplayState(messages, run, null);
    const specBubble = s.items.find((i) => i.stage === 'spec');
    expect(specBubble?.pendingApproval).toEqual({ gate: 'spec' });
  });

  it('completed 且有 artifact 时 done=true 且预览可渲染', () => {
    const messages = [msg('code', 1, '<html/>', 'engineer')];
    const run = { status: 'completed', currentStage: 'code' } as Run;
    const artifact = { kind: 'html', filename: 'index.html', content: '<html/>' };
    const s = buildReplayState(messages, run, artifact);
    expect(s.done).toBe(true);
    expect(s.artifact?.content).toBe('<html/>');
  });
});

describe('流畅衔接与生成中预览（用户反馈修复）', () => {
  it('提交瞬间 optimistic 出「PM 正在输入」占位气泡，消除白屏', () => {
    let s = initialChatState();
    s = markPendingStart(s, '做一个待办应用');
    // 提交即刻：用户消息(右) + PM 占位气泡(左, streaming)都在，不白屏
    const user = s.items.find((i) => i.side === 'user');
    const pm = s.items.find((i) => i.stage === 'spec');
    expect(user?.text).toBe('做一个待办应用');
    expect(pm).toMatchObject({ side: 'agent', role: 'pm', status: 'streaming' });
  });

  it('code 阶段流式 token 实时累积为 livePreview（边生成边出预览）', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, { type: 'stage_start', role: 'engineer', stage: 'code', iteration: 1 });
    s = reduceChatEvent(s, { type: 'token', role: 'engineer', stage: 'code', delta: '<!DOCTYPE html><html><body>半' });
    expect(s.livePreview).toBe('<!DOCTYPE html><html><body>半');
    s = reduceChatEvent(s, { type: 'token', role: 'engineer', stage: 'code', delta: '成品</body></html>' });
    expect(s.livePreview).toContain('成品');
  });

  it('非 code 阶段的 token 不进 livePreview（只有工程师产物可预览）', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, { type: 'stage_start', role: 'pm', stage: 'spec', iteration: 1 });
    s = reduceChatEvent(s, { type: 'token', role: 'pm', stage: 'spec', delta: '# 规格' });
    expect(s.livePreview).toBeNull();
  });

  it('run_done 后 livePreview 被正式 artifact 取代', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, { type: 'stage_start', role: 'engineer', stage: 'code', iteration: 1 });
    s = reduceChatEvent(s, { type: 'token', role: 'engineer', stage: 'code', delta: '<html>partial</html>' });
    s = reduceChatEvent(s, { type: 'run_done', runId: 'r', artifact: { kind: 'html', filename: 'index.html', content: '<html>final</html>' } });
    expect(s.artifact?.content).toBe('<html>final</html>');
  });
});

describe('code-review 修复（R1/R2/R5）', () => {
  it('R2: run_done 清除所有 pendingApproval（完成后审批卡不再可点）', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, { type: 'stage_start', role: 'engineer', stage: 'code', iteration: 1 });
    s = reduceChatEvent(s, { type: 'approval_required', runId: 'r', gate: 'code', summary: '' });
    expect(s.items[0].pendingApproval).toEqual({ gate: 'code' });
    s = reduceChatEvent(s, { type: 'run_done', runId: 'r', artifact: { kind: 'html', filename: 'i.html', content: '<h/>' } });
    expect(s.items[0].pendingApproval).toBeNull();
  });

  it('R2: error 也清除 pendingApproval', () => {
    let s = initialChatState();
    s = reduceChatEvent(s, { type: 'stage_start', role: 'pm', stage: 'spec', iteration: 1 });
    s = reduceChatEvent(s, { type: 'approval_required', runId: 'r', gate: 'spec', summary: '' });
    s = reduceChatEvent(s, { type: 'error', stage: 'spec', message: 'x', retryable: true });
    expect(s.items[0].pendingApproval).toBeNull();
  });
});

describe('stageProgress：从气泡派生当前阶段与已完成阶段', () => {
  const agentBubble = (stage: ChatItem['stage'], iteration: number, text: string, status: ChatItem['status']): ChatItem => ({
    id: `agent-${stage}-${iteration}`,
    side: 'agent',
    role: 'pm',
    stage,
    iteration,
    text,
    status,
    pendingApproval: null,
  });

  it('spec done + architecture streaming → doneStages 含 spec，current=architecture，running=true', () => {
    const s: ChatState = { ...initialChatState(), items: [
      agentBubble('spec', 1, '...', 'done'),
      agentBubble('architecture', 1, '', 'streaming'),
    ]};
    const p = stageProgress(s);
    expect(p.doneStages).toContain('spec');
    expect(p.current).toBe('architecture');
    expect(p.running).toBe(true);
  });

  it('空 items + 未结束 → current=null，running=false', () => {
    const p = stageProgress(initialChatState());
    expect(p.current).toBeNull();
    expect(p.doneStages).toEqual([]);
    expect(p.running).toBe(false);
  });

  it('state.done=true → running=false 且无 current', () => {
    const s: ChatState = { ...initialChatState(), done: true, items: [
      agentBubble('spec', 1, '...', 'done'),
      agentBubble('code', 1, '...', 'done'),
    ]};
    const p = stageProgress(s);
    expect(p.running).toBe(false);
    expect(p.current).toBeNull();
    expect(p.doneStages).toContain('spec');
    expect(p.doneStages).toContain('code');
  });

  it('同阶段多轮：以最新一轮的 status 判定 done', () => {
    const s: ChatState = { ...initialChatState(), items: [
      agentBubble('spec', 1, 'v1', 'done'),
      agentBubble('spec', 2, '', 'streaming'),
    ]};
    const p = stageProgress(s);
    // 最新一轮 spec 还在 streaming → 不算 done，且 current=spec
    expect(p.doneStages).not.toContain('spec');
    expect(p.current).toBe('spec');
  });
});

describe('code-review 修复（C5）', () => {
  it('重放保留 requirement 为用户气泡（右），不丢原始想法', () => {
    const messages = [
      { id: 'r1', runId: 'r1', artifactId: null, seq: 1, iteration: 1, role: 'coordinator', stage: 'requirement', content: '做一个待办应用', causeBy: 'RunRequirementAction', createdAt: new Date().toISOString() },
      { id: 's1', runId: 'r1', artifactId: null, seq: 2, iteration: 1, role: 'pm', stage: 'spec', content: '规格', causeBy: 'RunSpecAction', createdAt: new Date().toISOString() },
    ] as never;
    const s = buildReplayState(messages, { status: 'running', currentStage: null }, null);
    const reqBubble = s.items.find((i) => i.stage === 'requirement' || i.side === 'user');
    expect(reqBubble).toBeTruthy();
    expect(reqBubble?.side).toBe('user');
    expect(reqBubble?.text).toBe('做一个待办应用');
    // agent 的 spec 气泡也在
    expect(s.items.some((i) => i.stage === 'spec')).toBe(true);
  });
});

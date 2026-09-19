import { describe, it, expect } from 'vitest';
import { mergeReplayWithLive } from '../../src/hooks/useRunStream.js';
import { initialChatState, type ChatState, type ChatItem } from '../../src/lib/chatReducer.js';

const agentBubble = (stage: string, iteration: number, text: string, status: ChatItem['status'] = 'done'): ChatItem => ({
  id: `agent-${stage}-${iteration}`, side: 'agent', role: 'pm', stage: stage as never,
  iteration, text, status, pendingApproval: null,
});

describe('mergeReplayWithLive：进行中刷新重放 + SSE 增量合并（review R1）', () => {
  it('首个 SSE 事件到达时**保留**重放历史气泡，不丢', () => {
    const replayed: ChatState = { ...initialChatState(), items: [agentBubble('spec', 1, '规格 v1')] };
    // SSE 只推来了一个新阶段（architecture 开始），没有 spec
    const live: ChatState = { ...initialChatState(), items: [agentBubble('architecture', 1, '', 'streaming')] };
    const merged = mergeReplayWithLive(replayed, live);
    // 重放的 spec 必须保留，且 architecture 增量在后
    const stages = merged.items.map((i) => i.stage);
    expect(stages).toContain('spec');
    expect(stages).toContain('architecture');
  });

  it('SSE 与重放有同一气泡时，以 SSE（更新/流式）为准', () => {
    const replayed: ChatState = { ...initialChatState(), items: [agentBubble('spec', 1, '旧文本')] };
    const live: ChatState = { ...initialChatState(), items: [agentBubble('spec', 1, '新文本流式中', 'streaming')] };
    const merged = mergeReplayWithLive(replayed, live);
    const spec = merged.items.find((i) => i.stage === 'spec');
    expect(spec?.text).toBe('新文本流式中');
  });

  it('live 为空时用重放（SSE 尚未推送）', () => {
    const replayed: ChatState = { ...initialChatState(), items: [agentBubble('spec', 1, 'x')] };
    const merged = mergeReplayWithLive(replayed, initialChatState());
    expect(merged.items).toHaveLength(1);
  });

  it('同 key 时 replay 的完整 done 气泡不被 live 空气泡覆盖（进行中进入不丢 PM 结果）', () => {
    const replayed = { ...initialChatState(), items: [agentBubble('spec', 1, '完整PM产物', 'done')] };
    const live = { ...initialChatState(), items: [agentBubble('spec', 1, '', 'streaming')] }; // 中途进入只收到 stage_start
    const merged = mergeReplayWithLive(replayed, live);
    const spec = merged.items.find((i) => i.stage === 'spec');
    expect(spec?.text).toBe('完整PM产物'); // 取完整版，不被空气泡盖掉
  });

  it('live 有更新内容时仍用 live（流式推进不被回退）', () => {
    const replayed = { ...initialChatState(), items: [agentBubble('spec', 1, '旧', 'streaming')] };
    const live = { ...initialChatState(), items: [agentBubble('spec', 1, '旧内容+新token', 'streaming')] };
    const merged = mergeReplayWithLive(replayed, live);
    expect(merged.items.find((i) => i.stage === 'spec')?.text).toBe('旧内容+新token');
  });
});

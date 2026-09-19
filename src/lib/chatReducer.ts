import type { OrchestratorEvent, Stage } from '../../server/orchestrator/types.js';
import type { AgentMessage, Artifact, Run } from '../../shared-types/index.js';

/** 中栏渲染单元：一条聊天气泡（agent 左 / user 右）。 */
export interface ChatItem {
  id: string;
  side: 'agent' | 'user';
  role?: string;
  stage?: Stage;
  iteration: number;
  text: string;
  status: 'streaming' | 'done' | 'error';
  /** 该气泡下方挂审批卡（agent 本级最新一轮且待决策） */
  pendingApproval?: { gate: string } | null;
}

export interface ChatState {
  items: ChatItem[];
  done: boolean;
  error: string | null;
  artifact: { kind: string; filename: string; content: string } | null;
  /** code 阶段流式累积的 partial HTML（生成中实时预览用；run_done 后被 artifact 取代） */
  livePreview: string | null;
  /** 各阶段开始时间戳（进度条计时用）：首次 stage_start 时记录，不随 iteration 重置 */
  stageStarts: Partial<Record<Stage, number>>;
  /** files_saved 事件的轻量计数信号：App 依赖其变化增量重拉文件树 */
  filesVersion: number;
}

export function initialChatState(): ChatState {
  return { items: [], done: false, error: null, artifact: null, livePreview: null, stageStarts: {}, filesVersion: 0 };
}

const bubbleId = (stage: string | undefined, iteration: number, side: string) =>
  `${side}-${stage ?? 'msg'}-${iteration}`;

/** SSE 事件 → 聊天气泡流（纯函数，便于单测）。 */
export function reduceChatEvent(state: ChatState, e: OrchestratorEvent): ChatState {
  switch (e.type) {
    case 'stage_start': {
      // 新一轮同阶段 = 新气泡（保留历史轮次）；并清掉上一轮同阶段气泡的待审批标记。
      // 但若已有同 stage+iteration 的占位气泡（markPendingStart optimistic 产生），复用它而非重复新增。
      const cleared = state.items.map((it) => (it.stage === e.stage ? { ...it, pendingApproval: null } : it));
      const existing = cleared.findIndex((it) => it.stage === e.stage && it.iteration === e.iteration);
      const items = existing >= 0
        ? cleared.map((it, i) => (i === existing ? { ...it, status: 'streaming' as const, role: e.role } : it))
        : cleared.concat({
            id: bubbleId(e.stage, e.iteration, 'agent'),
            side: 'agent' as const,
            role: e.role,
            stage: e.stage,
            iteration: e.iteration,
            text: '',
            status: 'streaming' as const,
            pendingApproval: null,
          });
      // 记录阶段计时起点：仅在尚未记录时写入（幂等，重跑不覆盖）
      const stageStarts = state.stageStarts[e.stage] !== undefined
        ? state.stageStarts
        : { ...state.stageStarts, [e.stage]: Date.now() };
      return { ...state, items, stageStarts };
    }
    case 'token': {
      const items = state.items.map((it) =>
        it.stage === e.stage && it.status === 'streaming' ? { ...it, text: it.text + e.delta } : it,
      );
      // 生成中预览：仅 code 阶段（工程师产物）的流式 token 累积为 livePreview
      const livePreview = e.stage === 'code' ? (state.livePreview ?? '') + e.delta : state.livePreview;
      return { ...state, items, livePreview };
    }
    case 'stage_done': {
      const items = state.items.map((it) =>
        it.stage === e.message.stage && it.status === 'streaming'
          ? { ...it, status: 'done' as const, text: e.message.content?.trim() ? e.message.content : it.text }
          : it,
      );
      return { ...state, items };
    }
    case 'approval_required': {
      // 标记该阶段最新一轮（最后一个该 stage）气泡待审批
      let lastIdx = -1;
      state.items.forEach((it, i) => { if (it.stage === e.gate) lastIdx = i; });
      const items = state.items.map((it, i) =>
        i === lastIdx ? { ...it, pendingApproval: { gate: e.gate } } : it,
      );
      return { ...state, items };
    }
    case 'run_done': {
      // 完成：code 气泡收尾，且清掉所有待审批卡（review R2：完成后审批卡不应再可点）
      const items = state.items.map((it) => ({
        ...it,
        pendingApproval: null,
        ...(it.stage === 'code' && it.status === 'streaming' ? { status: 'done' as const } : {}),
      }));
      return { ...state, items, done: true, artifact: e.artifact };
    }
    case 'artifact_ready': {
      // 工程师 code 完成 → 预览产物提前就绪（不等 run_done），预览按钮即刻变绿
      return { ...state, artifact: e.artifact };
    }
    case 'files_saved': {
      // 某阶段通过审批 → 其文件落盘，递增计数信号供 App 增量重拉文件树
      return { ...state, filesVersion: state.filesVersion + 1 };
    }
    case 'error': {
      // 出错：清掉所有待审批卡（review R2），标记该阶段错误
      const items = state.items.map((it) => ({
        ...it,
        pendingApproval: null,
        ...(it.stage === e.stage ? { status: 'error' as const } : {}),
      }));
      return { ...state, items, error: e.message };
    }
    default:
      return state;
  }
}

/** 底部输入框发的用户消息（壳：仅本地气泡，不触发任何重跑/请求）。 */
export function appendUserMessage(state: ChatState, text: string): ChatState {
  const item: ChatItem = {
    id: `user-${state.items.filter((i) => i.side === 'user').length}-${Date.now()}`,
    side: 'user',
    iteration: 0,
    text,
    status: 'done',
    pendingApproval: null,
  };
  return { ...state, items: [...state.items, item] };
}

/**
 * 提交需求瞬间的 optimistic 渲染（消白屏）：
 * 立刻出「用户消息(右) + PM 正在输入(左, streaming)」，不等任何网络回包。
 * 后续真实 stage_start/token 到来时，spec 气泡会被接管更新（同 stage 复用 streaming 气泡）。
 */
export function markPendingStart(state: ChatState, idea: string): ChatState {
  const withUser = appendUserMessage(state, idea);
  const pmPlaceholder: ChatItem = {
    id: bubbleId('spec', 1, 'agent'),
    side: 'agent' as const,
    role: 'pm',
    stage: 'spec',
    iteration: 1,
    text: '',
    status: 'streaming' as const,
    pendingApproval: null,
  };
  return { ...withUser, items: [...withUser.items, pmPlaceholder], stageStarts: { ...withUser.stageStarts, spec: Date.now() } };
}

/**
 * 由聊天气泡派生进度条状态（Task 4 进度条用）。
 * - doneStages：最新一轮 status='done' 的阶段
 * - current：正在 streaming 的阶段（无则 null）
 * - running：未结束（!done && !error）且有任何 streaming 活动
 */
export function stageProgress(state: ChatState): {
  current: Stage | null;
  doneStages: Stage[];
  running: boolean;
} {
  // 每个 stage 取最新一轮（iteration 最大）的气泡状态。
  // 仅关注 agent 三阶段（spec/architecture/code）；requirement（用户原始想法）不算进度条阶段。
  const PROGRESS_STAGES: readonly Stage[] = ['spec', 'architecture', 'code'];
  const latestByStage = new Map<Stage, ChatItem>();
  for (const it of state.items) {
    if (!it.stage || !PROGRESS_STAGES.includes(it.stage)) continue;
    const prev = latestByStage.get(it.stage);
    if (!prev || it.iteration >= prev.iteration) latestByStage.set(it.stage, it);
  }
  const doneStages: Stage[] = [];
  let current: Stage | null = null;
  for (const [stage, it] of latestByStage) {
    if (it.status === 'done') doneStages.push(stage);
    else if (it.status === 'streaming' && current === null) current = stage;
  }
  const running = !state.done && !state.error && current !== null;
  return { current, doneStages, running };
}

/**
 * 关页/切换会话重放：由已落库消息 + run 状态重建聊天气泡流。
 * status=awaiting_approval 时，给当前待决策阶段的最后一条气泡挂审批卡。
 */
export function buildReplayState(
  messages: AgentMessage[],
  run: Pick<Run, 'status' | 'currentStage'> & Partial<Pick<Run, 'error'>>,
  artifact: Pick<Artifact, 'kind' | 'filename' | 'content'> | null,
): ChatState {
  // requirement（用户原始想法）渲染为右侧用户气泡；agent 阶段渲染为左侧气泡（review C5：不再丢原始想法）
  const items: ChatItem[] = messages.map((m) =>
    m.stage === 'requirement'
      ? {
          id: bubbleId(m.stage, m.iteration, 'user'),
          side: 'user' as const,
          role: m.role,
          stage: m.stage,
          iteration: m.iteration,
          text: m.content,
          status: 'done' as const,
          pendingApproval: null,
        }
      : {
          id: bubbleId(m.stage, m.iteration, 'agent'),
          side: 'agent' as const,
          role: m.role,
          stage: m.stage,
          iteration: m.iteration,
          text: m.content,
          status: 'done' as const,
          pendingApproval: null,
        },
  );

  if (run.status === 'awaiting_approval' && run.currentStage) {
    // 给该阶段最后一轮气泡挂审批卡
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].stage === run.currentStage) {
        items[i] = { ...items[i], pendingApproval: { gate: run.currentStage } };
        break;
      }
    }
  }

  const done = run.status === 'completed';

  // 从消息 createdAt 填充各阶段计时起点（每阶段取第一条消息的时间）
  const stageStarts: Partial<Record<Stage, number>> = {};
  for (const m of messages) {
    if (m.stage && stageStarts[m.stage] === undefined) {
      const t = new Date(m.createdAt).getTime();
      if (!isNaN(t)) stageStarts[m.stage] = t;
    }
  }

  return {
    items,
    done,
    // review C3：优先用 run 落库的真实失败原因，缺省才用通用文案
    error: run.status === 'failed' ? (run.error ?? '运行失败') : null,
    artifact: done && artifact ? { kind: artifact.kind, filename: artifact.filename, content: artifact.content } : null,
    livePreview: null, // 重放场景用已落库 artifact，无需 livePreview
    stageStarts,
    filesVersion: 0,
  };
}

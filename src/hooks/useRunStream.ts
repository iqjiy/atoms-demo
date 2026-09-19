import { useEffect, useRef, useState, useCallback } from 'react';
import type { OrchestratorEvent } from '../../server/orchestrator/types.js';
import { initialChatState, reduceChatEvent, buildReplayState, stageProgress, type ChatState } from '../lib/chatReducer.js';
import type { AgentMessage, Artifact, DocFile, Run } from '../../shared-types/index.js';

export interface RunHandle {
  runId: string;
  projectId: string;
}

/** 提交需求创建运行（P5：mode 选审批/直通）。 */
export async function startRun(idea: string, mode: 'auto' | 'approve' = 'auto'): Promise<RunHandle> {
  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, mode }),
  });
  if (!res.ok) throw new Error(`创建运行失败：${res.status}`);
  return (await res.json()) as RunHandle;
}

/** 提交某闸门的审批决策（通过/驳回+意见）。 */
export async function postDecision(runId: string, gate: string, decision: boolean, comment?: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, comment, gate }),
  });
  if (!res.ok) throw new Error(`决策失败：${res.status}`);
}

/** 会话列表项（左栏）。 */
export interface SessionItem {
  projectId: string;
  title: string;
  latestRun: { runId: string; status: Run['status']; currentStage: Run['currentStage'] } | null;
  createdAt: string;
}

/** 拉当前 owner 的会话列表。 */
export async function listSessions(): Promise<SessionItem[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('加载会话失败');
  const body = (await res.json()) as { projects: Array<{ id: string; title: string; createdAt: string; latestRun: SessionItem['latestRun'] }> };
  return body.projects.map((p) => ({ projectId: p.id, title: p.title, latestRun: p.latestRun, createdAt: p.createdAt }));
}

/** 拉某 run 的文件树。 */
export async function listFiles(runId: string): Promise<DocFile[]> {
  const res = await fetch(`/api/runs/${runId}/files`);
  if (!res.ok) throw new Error('加载文件失败');
  return ((await res.json()) as { files: DocFile[] }).files;
}

/**
 * 订阅某 run 的 SSE 事件流，归约为聊天状态；进行中实时推送。
 * 已完成/失败的 run 由 useSession 走重放（buildReplayState），不走此 hook。
 */
export function useRunStream(runId: string | null): ChatState {
  const [state, setState] = useState<ChatState>(initialChatState());
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => setState(initialChatState()), []);

  useEffect(() => {
    reset();
    if (!runId) return;

    const es = new EventSource(`/api/runs/${runId}/stream`);
    esRef.current = es;
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as OrchestratorEvent;
        setState((s) => reduceChatEvent(s, e));
        if (e.type === 'run_done' || e.type === 'error') es.close();
      } catch {
        /* 忽略非 JSON 心跳 */
      }
    };
    es.onerror = () => { /* 运行结束/网络断开：依赖服务端在 run_done 后关闭 */ };
    return () => es.close();
  }, [runId, reset]);

  return state;
}

/**
 * 会话加载（切换会话/关页重放）：拉 messages + run 状态 + artifact，
 * 进行中则交 SSE 续流，否则用 buildReplayState 重建。
 */
export function useSession(runId: string | null): { state: ChatState; live: boolean; progress: ReturnType<typeof stageProgress> } {
  const live = useRunStream(runId);
  const [replayed, setReplayed] = useState<ChatState>(initialChatState());
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!runId) {
      setReplayed(initialChatState());
      setIsLive(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [runRes, msgRes, artRes] = await Promise.all([
        fetch(`/api/runs/${runId}`),
        fetch(`/api/runs/${runId}/messages`),
        fetch(`/api/runs/${runId}/artifacts`),
      ]);
      if (cancelled) return;
      const run = ((await runRes.json()) as { run: Run }).run;
      const messages = ((await msgRes.json()) as { messages: AgentMessage[] }).messages;
      const artifacts = ((await artRes.json()) as { artifacts: Artifact[] }).artifacts;
      const artifact = artifacts.length ? artifacts[artifacts.length - 1] : null;

      // 进行中（含 awaiting_approval 但无活跃 SSE 的关页场景）→ 重放基线 + SSE 续流
      const inFlight = run.status === 'running' || run.status === 'awaiting_approval';
      setIsLive(inFlight);
      setReplayed(buildReplayState(messages, run, artifact));
    })().catch(() => setIsLive(false));
    return () => { cancelled = true; };
  }, [runId]);

  // 进行中：以重放为基线叠加 SSE 增量；已结束：纯重放
  const state = isLive ? mergeReplayWithLive(replayed, live) : replayed;
  return { state, live: isLive, progress: stageProgress(state) };
}

/**
 * 重放基线与 SSE 增量合并（review R1）：进行中刷新时，重放含全部历史气泡，
 * SSE 只推增量。按 (side,stage,iteration) 键合并——SSE 更新/新增覆盖同键，重放补足 SSE 未覆盖的历史。
 * 不能「一有 SSE 事件就整包换成 live」（会丢历史），也不能整包用 replay（会丢流式增量）。
 */
export function mergeReplayWithLive(replayed: ChatState, live: ChatState): ChatState {
  const key = (it: ChatState['items'][number]) => `${it.side}:${it.stage ?? 'msg'}:${it.iteration}`;
  const replayByKey = new Map(replayed.items.map((it) => [key(it), it]));
  const liveKeys = new Map(live.items.map((it) => [key(it), it]));
  // 重放气泡：仅保留 live 未覆盖的（历史）；live 气泡：全部（含更新/新增/流式）
  const historical = replayed.items.filter((it) => !liveKeys.has(key(it)));
  // 兜底：同 key 时若 replayed 已 done 且 text 更长（live 还在空/流式早期），用 replayed 完整版，防空气泡盖完整气泡
  const liveResolved = live.items.map((it) => {
    const r = replayByKey.get(key(it));
    if (r && r.status === 'done' && r.text.length > it.text.length) return r;
    return it;
  });
  const items = [...historical, ...liveResolved];
  return {
    items,
    done: live.done || replayed.done,
    error: live.error ?? replayed.error,
    artifact: live.artifact ?? replayed.artifact,
    livePreview: live.livePreview ?? replayed.livePreview,
    // stageStarts：live 优先（含实时计时），replay 兜底（历史会话）
    stageStarts: { ...replayed.stageStarts, ...live.stageStarts },
    // filesVersion：取两侧较大者，保持单调递增（files_saved 增量刷新文件树）
    filesVersion: Math.max(live.filesVersion, replayed.filesVersion),
  };
}

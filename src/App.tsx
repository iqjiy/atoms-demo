import { useState, useEffect, useCallback, useRef } from 'react';
import SessionList from './components/session/SessionList';
import ChatFlow from './components/chat/ChatFlow';
import ChatComposer from './components/chat/ChatComposer';
import PreviewFrame from './components/preview/PreviewFrame';
import PreviewToolbar from './components/preview/PreviewToolbar';
import FileTree from './components/files/FileTree';
import FileViewer from './components/files/FileViewer';
import AgentConfigModal from './components/config/AgentConfigModal';
import {
  startRun,
  postDecision,
  listSessions,
  listFiles,
  useSession,
  type SessionItem,
} from './hooks/useRunStream';
import { appendUserMessage, markPendingStart, initialChatState, type ChatState } from './lib/chatReducer';
import type { DocFile } from '../shared-types/index.js';
import type { Stage } from '../shared-types/index.js';

export default function App() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [active, setActive] = useState<SessionItem | null>(null);
  const [mode, setMode] = useState<'auto' | 'approve'>('approve');
  const [idea, setIdea] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [userMessages, setUserMessages] = useState<string[]>([]);
  /** 提交瞬间的 optimistic 占位（消白屏）：拿到 runId 前显示「用户消息 + PM 正在输入」 */
  const [pendingStart, setPendingStart] = useState<ChatState | null>(null);
  /** 通过/驳回的乐观决策叠加（修改1A）：gate → 决策发生时的迭代轮次 + decision；
   * 只贴在被点击那一轮气泡上；下一轮 stage_start（iteration+1）后新气泡 iteration 不同，叠加自然失效 */
  const [decisions, setDecisions] = useState<Record<string, { iteration: number; decision: 'approved' | 'rejected' }>>({});
  /** 预览全屏（Fullscreen API） */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewSectionRef = useRef<HTMLElement | null>(null);
  /** 工作区文件树 */
  const [files, setFiles] = useState<DocFile[]>([]);
  const [activeFile, setActiveFile] = useState<DocFile | null>(null);
  /** Agent 配置弹窗（UI 试行占位，功能待开发） */
  const [configOpen, setConfigOpen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await previewSectionRef.current?.requestFullscreen();
    }
  }, []);

  // ESC / 浏览器原生退出全屏时同步按钮文案
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const runId = active?.latestRun?.runId ?? null;
  const { state: baseState, progress } = useSession(runId);
  // 叠加底部输入框的「壳」用户消息（纯展示，不触发重跑）
  const withUser = userMessages.reduce((s, m) => appendUserMessage(s, m), baseState);
  // 修改1A：叠加乐观决策条——仅贴在被点击那一轮气泡上（iteration 匹配），下一轮 stage_start 后新气泡 iteration 不同，叠加自然失效
  const withDecisions = (() => {
    const gates = Object.keys(decisions);
    if (gates.length === 0) return withUser;
    return {
      ...withUser,
      items: withUser.items.map((it) => {
        if (!it.stage || it.kind === 'feedback') return it;
        const d = decisions[it.stage];
        if (!d || it.iteration !== d.iteration) return it;
        return { ...it, pendingApproval: null, decision: d.decision };
      }),
    };
  })();
  // 提交后、runId 未就位时用 optimistic 占位；一旦有真实数据则切换
  const state = pendingStart && baseState.items.length === 0 ? pendingStart : withDecisions;
  // pendingStart 期间 progress 为空，合成「PM 进行中」让进度条立刻亮起
  const displayProgress = pendingStart && baseState.items.length === 0
    ? { current: 'spec' as Stage, doneStages: [] as Stage[], running: true }
    : progress;
  // 阶段计时起点来自 chat state（reducer 数据层），不再用渲染层 effect
  const stageStarts = state.stageStarts;

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch {
      /* 忽略列表加载失败 */
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // run 状态变化后刷新会话列表（更新左栏状态标签）
  useEffect(() => {
    if (baseState.done || baseState.error) refreshSessions();
  }, [baseState.done, baseState.error, refreshSessions]);

  // 真实 SSE 数据一旦接管（有气泡），清除 optimistic 占位
  useEffect(() => {
    if (baseState.items.length > 0) setPendingStart(null);
  }, [baseState.items.length]);

  // 修跨会话泄漏（I2）：runId 变化时重置乐观决策叠加，避免把上一条会话的 decision 误贴到当前会话气泡
  useEffect(() => {
    setDecisions({});
  }, [runId]);

  // run 完成 / 会话切换 / files_saved（某阶段通过落盘）后拉文件树
  // runId 变化（含切换到无文件的进行中会话）时先清空，再看 done/filesVersion 决定是否拉取——
  // 否则旧会话的文件树会残留到新会话（code-review 发现 #1）。
  useEffect(() => {
    setFiles([]);
    setActiveFile(null);
  }, [runId]);

  useEffect(() => {
    if (!runId) return; // 清空已由上面的 runId effect 处理
    if (!state.done && state.filesVersion === 0) return;
    let cancelled = false;
    listFiles(runId)
      .then((fs) => { if (!cancelled) setFiles(fs); })
      .catch(() => { /* 忽略文件加载失败 */ });
    return () => { cancelled = true; };
  }, [runId, state.done, state.filesVersion]);

  const handleNew = () => {
    setActive(null);
    setIdea('');
    setUserMessages([]);
    setPendingStart(null);
  };

  const handleSelect = (s: SessionItem) => {
    setActive(s);
    setUserMessages([]);
    setPendingStart(null);
  };

  const handleStart = async () => {
    const v = idea.trim();
    if (!v || submitting) return;
    setSubmitting(true);
    // 消白屏：提交瞬间 optimistic 出「用户消息 + PM 正在输入」，不等 runId
    setPendingStart(markPendingStart(initialChatState(), v));
    try {
      const h = await startRun(v, mode);
      await refreshSessions();
      setActive({
        projectId: h.projectId,
        title: v.slice(0, 30),
        latestRun: { runId: h.runId, status: 'running', currentStage: null },
        createdAt: new Date().toISOString(),
      });
      setIdea('');
      setUserMessages([]);
      // 真实 SSE 数据接管后清掉占位（baseState.items 一旦有内容即切换）
    } catch (e) {
      alert(String(e));
      setPendingStart(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecide = async (gate: string, approved: boolean, comment?: string) => {
    if (!runId) return;
    setDeciding(true);
    // 修改1A：乐观出「✓ 已通过 / ✕ 已驳回」条——记录被点击那一刻该 gate 最新一轮气泡的 iteration，
    // 叠加只贴那一轮；下一轮 stage_start 后新气泡 iteration 不同，叠加自动失效
    const decidedIteration = (() => {
      let iter = 0;
      withUser.items.forEach((it) => {
        if (it.stage === gate && it.kind !== 'feedback' && it.iteration >= iter) iter = it.iteration;
      });
      return iter;
    })();
    setDecisions((d) => ({ ...d, [gate]: { iteration: decidedIteration, decision: approved ? 'approved' : 'rejected' } }));
    try {
      await postDecision(runId, gate, approved, comment);
    } catch (e) {
      // 回滚：撤掉乐观条，审批卡仍在（baseState 未变）并提示
      setDecisions((d) => { const { [gate]: _dropped, ...rest } = d; return rest; });
      alert(String(e));
    } finally {
      setDeciding(false);
    }
  };

  // 底部输入框（壳）：只把消息加到右侧，不发任何请求/重跑
  const handleUserSend = (text: string) => {
    setUserMessages((m) => [...m, text]);
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 左栏：会话列表 */}
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white p-4 md:w-64 md:border-b-0 md:border-r">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Atoms Demo</h1>
        <p className="mb-3 text-xs text-slate-500">多 Agent 接力，把想法变成应用</p>
        <SessionList
          sessions={sessions}
          activeProjectId={active?.projectId ?? null}
          onSelect={handleSelect}
          onNew={handleNew}
        />
      </aside>

      {/* 中栏：聊天流 */}
      <section className="flex flex-1 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 md:border-b-0 md:border-r">
        {/* 新建会话：想法输入 + 模式选择 */}
        {!active && (
          <div className="border-b border-slate-200 bg-white p-4">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              className="h-20 w-full resize-none rounded-md border border-slate-300 p-2 text-sm focus:border-slate-400 focus:outline-none"
              placeholder="例如：做一个待办事项应用，支持增删改和完成标记"
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1 text-slate-600">
                  <input type="radio" name="mode" checked={mode === 'approve'} onChange={() => setMode('approve')} />
                  逐级审批
                </label>
                <label className="flex items-center gap-1 text-slate-600">
                  <input type="radio" name="mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />
                  直接生成
                </label>
                <button
                  type="button"
                  onClick={() => setConfigOpen(true)}
                  className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  ⚙ Agent配置
                </button>
              </div>
              <button
                type="button"
                onClick={handleStart}
                disabled={submitting || !idea.trim()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? '创建中…' : '开始'}
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {active || pendingStart ? (
            // 消白屏：提交后 active 尚未 set（等 runId），但 pendingStart 已让 ChatFlow 立即渲染占位气泡
            <ChatFlow state={state} progress={displayProgress} stageStarts={stageStarts} deciding={deciding} onDecide={handleDecide} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
              选择左侧会话，或在上方输入想法开始新会话
            </div>
          )}
        </div>

        {/* 底部输入框（壳） */}
        {(active || pendingStart) && <ChatComposer onSend={handleUserSend} />}
      </section>

      {/* 右栏：工作区（目录卡片 + 文件查看 + 全屏预览按钮） */}
      <section
        ref={previewSectionRef}
        className={`flex flex-1 flex-col bg-white p-4 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
      >
        {isFullscreen && state.artifact ? (
          // 全屏模式：只显示产物 iframe + 工具栏
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">预览</h2>
              <PreviewToolbar
                html={state.artifact.content}
                onRefresh={() => setRefreshKey((k) => k + 1)}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            </div>
            <div className="min-h-0 flex-1">
              <PreviewFrame html={state.artifact.content} refreshKey={refreshKey} />
            </div>
          </>
        ) : (
          <>
            {/* 顶部：全屏预览按钮（未就绪白色禁用，就绪绿色可点） */}
            <div className="mb-3">
              <button
                type="button"
                onClick={toggleFullscreen}
                disabled={!state.artifact}
                className={`w-full rounded-md px-4 py-2 text-sm font-medium ${
                  state.artifact
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'cursor-not-allowed border border-slate-300 bg-white text-slate-400'
                }`}
              >
                ▶ 全屏预览
              </button>
            </div>

            {/* 中部：文件查看器（选中文件时显示，否则显示目录树） */}
            {activeFile ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <button
                  type="button"
                  onClick={() => setActiveFile(null)}
                  className="mb-2 self-start rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  ← 返回目录
                </button>
                <div className="min-h-0 flex-1">
                  <FileViewer file={activeFile} />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <FileTree files={files} activePath={null} onSelect={setActiveFile} />
              </div>
            )}

            {/* 底部：静态提示 */}
            <p className="mt-3 text-xs text-slate-400">
              所有文件会在对话过程中由 Agent 生成并保存，点击目录即可查看文件内容
            </p>
          </>
        )}
      </section>

      <AgentConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}

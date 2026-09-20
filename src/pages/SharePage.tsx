import { useEffect, useState } from 'react';
import ChatFlow from '../components/chat/ChatFlow';
import PreviewFrame from '../components/preview/PreviewFrame';
import PreviewToolbar from '../components/preview/PreviewToolbar';
import FileTree from '../components/files/FileTree';
import FileViewer from '../components/files/FileViewer';
import { buildReplayState, stageProgress } from '../lib/chatReducer';
import type { AgentMessage, Artifact, DocFile, Run } from '../../shared-types/index.js';

interface SharePayload {
  project: { title: string; initialIdea: string; createdAt: string };
  run: Pick<Run, 'status' | 'currentStage' | 'iteration' | 'startedAt' | 'finishedAt'>;
  messages: AgentMessage[];
  artifact: Artifact | null;
  files: DocFile[];
}

/**
 * 只读分享页 /p/:shareId：面试官打开链接看作品。
 * 一次性拉全量快照（无 SSE / 无审批 / 无输入框 / 无新建），写面为零。
 * 与作者视图共用 buildReplayState 重建聊天流，保证只读视图与作者视图一致。
 */
export default function SharePage({ shareId }: { shareId: string }) {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState<'404' | 'net' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/share/${shareId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) { setError('404'); return; }
        if (!res.ok) { setError('net'); return; }
        setPayload((await res.json()) as SharePayload);
      })
      .catch(() => { if (!cancelled) setError('net'); });
    return () => { cancelled = true; };
  }, [shareId]);

  if (error === '404') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
        链接无效或作品已删除
      </div>
    );
  }
  if (error === 'net') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
        加载失败，请检查网络后重试
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          重试
        </button>
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
        加载中…
      </div>
    );
  }

  const state = buildReplayState(payload.messages, payload.run, payload.artifact);
  const activeFile = payload.files.find((f) => f.path === activePath) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* 顶条：标题 + 想法 + 品牌带回流 */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-900">{payload.project.title}</h1>
          <p className="truncate text-xs text-slate-500">{payload.project.initialIdea}</p>
        </div>
        <span className="text-xs text-slate-400">由 Atoms Demo 生成</span>
        <a
          href="/"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          我也要做一个 →
        </a>
      </header>

      {/* 主体：中栏聊天流 + 右栏工作区/预览（只读） */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="flex min-h-0 flex-1 flex-col overflow-auto border-b border-slate-200 bg-slate-50 p-4 md:border-b-0 md:border-r">
          <ChatFlow
            state={state}
            progress={stageProgress(state)}
            stageStarts={state.stageStarts}
            onDecide={() => { /* 只读：不会触发（done 无 pendingApproval） */ }}
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col bg-white p-4">
          {state.artifact && (
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">预览（可玩）</h2>
              <PreviewToolbar html={state.artifact.content} onRefresh={() => setRefreshKey((k) => k + 1)} />
            </div>
          )}
          {state.artifact && (
            <div className="mb-3 h-64 min-h-0 md:h-auto md:flex-1">
              <PreviewFrame html={state.artifact.content} refreshKey={refreshKey} />
            </div>
          )}
          {payload.files.length > 0 && (
            <div className="min-h-0 flex-1 overflow-auto border-t border-slate-100 pt-3">
              {activeFile ? (
                <div className="flex min-h-0 flex-col">
                  <button
                    type="button"
                    onClick={() => setActivePath(null)}
                    className="mb-2 self-start rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    ← 返回目录
                  </button>
                  <div className="min-h-0">
                    <FileViewer file={activeFile} />
                  </div>
                </div>
              ) : (
                <FileTree files={payload.files} activePath={null} onSelect={(f) => setActivePath(f.path)} />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

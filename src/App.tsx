import { useState } from 'react';
import ChatInput from './components/chat/ChatInput';
import AgentTimeline from './components/timeline/AgentTimeline';
import PreviewFrame from './components/preview/PreviewFrame';
import PreviewToolbar from './components/preview/PreviewToolbar';
import { startRun, useRunStream } from './hooks/useRunStream';

export default function App() {
  const [runId, setRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useRunStream(runId);
  const running = runId !== null && !state.done && !state.error;

  const handleSubmit = async (idea: string) => {
    setSubmitting(true);
    try {
      const { runId: id } = await startRun(idea);
      setRunId(id);
    } catch (e) {
      alert(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 左栏：需求输入 */}
      <aside className="w-full border-b border-slate-200 bg-white p-4 md:w-80 md:border-b-0 md:border-r">
        <h1 className="text-lg font-semibold text-slate-900">Atoms Demo</h1>
        <p className="mt-1 text-sm text-slate-500">多 Agent 接力，把想法变成应用</p>
        <div className="mt-4">
          <ChatInput onSubmit={handleSubmit} disabled={submitting || running} />
        </div>
      </aside>

      {/* 中栏：协作过程 */}
      <section className="flex-1 overflow-auto border-b border-slate-200 bg-slate-50 p-4 md:border-b-0 md:border-r">
        <h2 className="mb-3 text-sm font-medium text-slate-700">协作过程</h2>
        <AgentTimeline state={state} />
      </section>

      {/* 右栏：预览 */}
      <section className="flex flex-1 flex-col bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">预览</h2>
          {state.artifact && (
            <PreviewToolbar
              html={state.artifact.content}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </div>
        {state.artifact ? (
          <div className="min-h-0 flex-1">
            <PreviewFrame html={state.artifact.content} refreshKey={refreshKey} />
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400">
            {running ? '正在生成，完成后将在此实时预览…' : '生成的应用将在此实时预览'}
          </div>
        )}
      </section>
    </div>
  );
}

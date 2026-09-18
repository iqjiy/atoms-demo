import { useState } from 'react';
import ChatInput from './components/chat/ChatInput';
import AgentTimeline from './components/timeline/AgentTimeline';
import { startRun, useRunStream } from './hooks/useRunStream';

export default function App() {
  const [runId, setRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

      {/* 右栏：预览（P4 接管 iframe） */}
      <section className="flex-1 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">预览</h2>
        {state.artifact ? (
          <div className="text-sm text-slate-500">
            产物已生成（{state.artifact.content.length} 字符），实时预览在下一阶段接入。
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400">
            生成的应用将在此实时预览
          </div>
        )}
      </section>
    </div>
  );
}

import type { SessionItem } from '../../hooks/useRunStream.js';

const STATUS_LABEL: Record<string, string> = {
  running: '进行中',
  awaiting_approval: '待审批',
  completed: '已完成',
  failed: '失败',
};

/** 左栏：会话列表 + 新建会话。一个会话 = 一个项目/run，相互独立。 */
export default function SessionList({
  sessions,
  activeProjectId,
  onSelect,
  onNew,
}: {
  sessions: SessionItem[];
  activeProjectId: string | null;
  onSelect: (s: SessionItem) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNew}
        className="mb-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        ＋ 新建会话
      </button>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {sessions.length === 0 && (
          <p className="px-1 text-xs text-slate-400">还没有会话，从下方输入想法开始。</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.projectId}
            type="button"
            onClick={() => onSelect(s)}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
              s.projectId === activeProjectId
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="truncate font-medium">{s.title}</div>
            <div className={`mt-0.5 text-xs ${s.projectId === activeProjectId ? 'text-slate-300' : 'text-slate-400'}`}>
              {s.latestRun ? STATUS_LABEL[s.latestRun.status] ?? s.latestRun.status : '未运行'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

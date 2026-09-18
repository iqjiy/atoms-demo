import type { StageState } from '../../lib/eventReducer.js';
import { renderMarkdown } from '../../lib/markdown.js';

const ROLE_LABEL: Record<string, string> = {
  pm: '产品经理',
  architect: '架构师',
  engineer: '工程师',
  coordinator: '协调',
};

const STAGE_LABEL: Record<string, string> = {
  requirement: '需求',
  spec: '产品规格',
  architecture: '架构设计',
  code: '代码生成',
};

/** 该阶段依赖的上游（体现接力衔接）。 */
const UPSTREAM_LABEL: Record<string, string> = {
  spec: '基于你的需求',
  architecture: '基于上游：产品规格',
  code: '基于上游：产品规格 + 架构设计',
};

function statusBadge(status: StageState['status']) {
  if (status === 'running')
    return <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">进行中…</span>;
  if (status === 'done')
    return <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">完成</span>;
  return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">失败</span>;
}

/** 单阶段卡片：角色 + 阶段 + 衔接说明 + 产物内容。 */
export default function StageCard({ stage }: { stage: StageState }) {
  const isCode = stage.stage === 'code';
  const isRunning = stage.status === 'running';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-800">
          {ROLE_LABEL[stage.role] ?? stage.role} · {STAGE_LABEL[stage.stage] ?? stage.stage}
        </div>
        {statusBadge(stage.status)}
      </div>
      {UPSTREAM_LABEL[stage.stage] && (
        <div className="mt-0.5 text-xs text-slate-400">⤷ {UPSTREAM_LABEL[stage.stage]}</div>
      )}
      {stage.text && (
        <div className="mt-2 max-h-80 overflow-auto rounded bg-slate-50 p-3 text-sm text-slate-700">
          {isCode ? (
            // F-04：代码产物只读展示，不渲染为可交互 HTML（预览在右栏 iframe）
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-600">
              {stage.text}
            </pre>
          ) : isRunning ? (
            // F-05/F-08：流式中显示纯文本，避免半截 markdown 闪烁 + O(n²) 重解析
            <pre className="whitespace-pre-wrap break-words text-sm">
              {stage.text}
              <span className="animate-pulse">▍</span>
            </pre>
          ) : (
            // 完成后一次性 markdown 渲染
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(stage.text) }}
            />
          )}
        </div>
      )}
    </div>
  );
}

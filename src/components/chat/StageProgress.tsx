import type { Stage } from '../../../shared-types/index.js';
import type { stageProgress } from '../../lib/chatReducer.js';
import { useElapsed } from '../../hooks/useElapsed.js';

type Progress = ReturnType<typeof stageProgress>;

const STAGE_LABEL: Record<Stage, string> = {
  spec: 'PM',
  architecture: '架构师',
  code: '工程师',
  requirement: '需求',
};

const ORDER: readonly Stage[] = ['spec', 'architecture', 'code'];

/** 单个步骤：图标 + 名称 + 计时。 */
function Step({
  stage,
  status,
  start,
  running,
}: {
  stage: Stage;
  status: 'pending' | 'current' | 'done' | 'failed';
  start: number | null;
  running: boolean;
}) {
  const elapsed = useElapsed(start, running);

  const dot =
    status === 'done' ? '✓' :
    status === 'failed' ? '✗' :
    status === 'current' ? null : // spinner 替代
    '○';

  const color =
    status === 'failed' ? 'text-red-600' :
    status === 'done' ? 'text-emerald-600' :
    status === 'current' ? 'text-slate-900' :
    'text-slate-400';

  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      {status === 'current' ? (
        <span
          className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-slate-400 border-t-transparent"
          aria-label="进行中"
        />
      ) : (
        <span className="inline-block w-2.5 text-center">{dot}</span>
      )}
      <span className={status === 'current' ? 'font-medium' : ''}>{STAGE_LABEL[stage]}</span>
      {start !== null && (
        <span className="tabular-nums text-slate-400" aria-label={`${STAGE_LABEL[stage]}耗时`}>
          {elapsed}
        </span>
      )}
    </div>
  );
}

/**
 * 顶部固定三步进度条（PM → 架构师 → 工程师）：
 * - 当前阶段：转圈 + 高亮 + 计时跳动
 * - 已完成：打勾 + 定格耗时
 * - 未到：灰色
 * - 终态：done 全部打勾；error 时当前阶段打 ✗，计时全部停止
 */
export default function StageProgress({
  progress,
  stageStarts,
  terminal,
}: {
  progress: Progress;
  stageStarts: Partial<Record<Stage, number>>;
  terminal: 'done' | 'error' | null;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center gap-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
      {ORDER.map((stage, i) => {
        const isCurrent = progress.current === stage;
        const isDone = progress.doneStages.includes(stage);
        // 终态修饰：done 时把未完成的步骤也视作 done（run_done 已清场）；
        // error 时正在 current 的阶段标 failed，其余按原状。
        const status: 'pending' | 'current' | 'done' | 'failed' =
          terminal === 'done' ? (isDone || isCurrent ? 'done' : 'pending') :
          terminal === 'error' ? (isCurrent ? 'failed' : isDone ? 'done' : 'pending') :
          isCurrent ? 'current' :
          isDone ? 'done' :
          'pending';
        return (
          <div key={stage} className="flex items-center gap-4">
            {i > 0 && <span className="text-slate-300">→</span>}
            <Step
              stage={stage}
              status={status}
              start={stageStarts[stage] ?? null}
              running={!terminal && isCurrent}
            />
          </div>
        );
      })}
      {terminal === 'done' && <span className="ml-auto text-xs text-emerald-600">已完成</span>}
      {terminal === 'error' && <span className="ml-auto text-xs text-red-600">已失败</span>}
    </div>
  );
}

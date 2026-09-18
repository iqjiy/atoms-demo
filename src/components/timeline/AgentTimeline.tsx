import type { TimelineState } from '../../lib/eventReducer.js';
import StageCard from './StageCard.js';

/** 中栏：多 Agent 接力时间线（阶段卡片 + 逐 token 流式）。 */
export default function AgentTimeline({ state }: { state: TimelineState }) {
  if (state.stages.length === 0 && !state.error) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        提交需求后，这里将实时显示 产品经理 → 架构师 → 工程师 的接力过程
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {state.stages.map((s) => (
        <StageCard key={s.stage} stage={s} />
      ))}
      {state.awaitingApproval && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          等待审批：架构方案已产出（P5 将支持批准/驳回）
        </div>
      )}
      {state.done && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          ✓ 生成完成，产物已就绪（右栏预览见 P4）
        </div>
      )}
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          出错：{state.error}
        </div>
      )}
    </div>
  );
}

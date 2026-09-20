import { useState } from 'react';

/**
 * 方案a：驳回必须填写意见。供组件与单元测试共用的纯判断。
 */
export function canConfirmReject(comment: string): boolean {
  return comment.trim().length > 0;
}

/**
 * 审批卡（P5）：挂在 agent 气泡下方。
 * 通过 = 批准本级进入下一级；意见+驳回 = 该 agent 带意见原地重跑（iteration+1）。
 *
 * 两态交互（防止"打了驳回意见却误点通过"导致意见丢失）：
 * - 默认态：只有 [✓ 通过] [✕ 驳回]，无输入框。点通过立即放行（零输入）。
 * - 驳回编辑态（点驳回后进入）：显示意见输入框 + [确认驳回并修改] [取消]。
 *   意见非空才可确认驳回；取消则回到默认态并清空意见。
 */
export default function ApprovalCard({
  gate,
  busy,
  onDecide,
}: {
  gate: string;
  busy?: boolean;
  onDecide: (approved: boolean, comment?: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');
  const [comment, setComment] = useState('');

  const confirmReject = () => {
    if (!canConfirmReject(comment)) return;
    onDecide(false, comment.trim());
  };

  const cancelReject = () => {
    setComment('');
    setMode('idle');
  };

  return (
    <div className="ml-0 mt-2 max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="mb-2 text-xs font-medium text-amber-800">等待你的审批</div>

      {mode === 'rejecting' && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="驳回意见（必填）：说明要修改的地方…"
          autoFocus
          className="mb-2 h-16 w-full resize-none rounded-md border border-amber-200 bg-white p-2 text-sm focus:border-amber-400 focus:outline-none"
        />
      )}

      {mode === 'idle' ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(true)}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            ✓ 通过
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('rejecting')}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            ✕ 驳回
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !canConfirmReject(comment)}
            onClick={confirmReject}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            确认驳回并修改
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={cancelReject}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}

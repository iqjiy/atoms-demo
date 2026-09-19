import { useState } from 'react';

/**
 * 审批卡（P5）：挂在 agent 气泡下方。
 * 通过 = 批准本级进入下一级；意见+驳回 = 该 agent 带意见原地重跑（iteration+1）。
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
  const [comment, setComment] = useState('');

  return (
    <div className="ml-0 mt-2 max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="mb-2 text-xs font-medium text-amber-800">等待你的审批</div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="驳回意见（可选）：说明要修改的地方…"
        className="mb-2 h-16 w-full resize-none rounded-md border border-amber-200 bg-white p-2 text-sm focus:border-amber-400 focus:outline-none"
      />
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
          onClick={() => onDecide(false, comment.trim() || undefined)}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          ✕ 驳回{comment.trim() ? '并修改' : ''}
        </button>
      </div>
    </div>
  );
}

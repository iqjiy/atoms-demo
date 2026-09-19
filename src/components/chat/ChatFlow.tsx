import type { ChatState, stageProgress } from '../../lib/chatReducer.js';
import type { Stage } from '../../../server/orchestrator/types.js';
import ChatBubble from './ChatBubble.js';
import ApprovalCard from './ApprovalCard.js';
import StageProgress from './StageProgress.js';

/** 中栏聊天流：agent 左 / 用户右气泡 + 气泡下审批卡 + 顶部三步进度条。 */
export default function ChatFlow({
  state,
  progress,
  stageStarts,
  deciding,
  onDecide,
}: {
  state: ChatState;
  progress: ReturnType<typeof stageProgress>;
  stageStarts: Partial<Record<Stage, number>>;
  deciding?: boolean;
  onDecide: (gate: string, approved: boolean, comment?: string) => void;
}) {
  if (state.items.length === 0 && !state.error) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        提交需求后，这里将以聊天形式实时显示 产品经理 → 架构师 → 工程师 的接力
      </div>
    );
  }
  const terminal = state.done ? 'done' : state.error ? 'error' : null;
  return (
    <div className="space-y-4">
      <StageProgress progress={progress} stageStarts={stageStarts} terminal={terminal} />
      {state.items.map((item) => (
        <div key={item.id}>
          <ChatBubble item={item} />
          {item.pendingApproval && (
            <ApprovalCard
              gate={item.pendingApproval.gate}
              busy={deciding}
              onDecide={(approved, comment) => onDecide(item.pendingApproval!.gate, approved, comment)}
            />
          )}
        </div>
      ))}
      {state.done && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          ✓ 生成完成，产物已就绪（见右侧预览）
        </div>
      )}
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          出错:{state.error}
        </div>
      )}
    </div>
  );
}

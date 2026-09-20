import { useEffect } from 'react';
import type { Stage } from '../../../shared-types/index.js';

/** Agent 链路中的一个节点（纯展示数据；后续对接 agent-config 调研的 chain definition） */
export interface AgentNode {
  name: string;
  stage: Stage;
  profile: string;
}

/** 默认链路：PM → Architect → Code（对应当前 roles.ts 硬编码三角） */
export const DEFAULT_AGENT_CHAIN: AgentNode[] = [
  { name: 'PM', stage: 'spec', profile: '产品经理' },
  { name: 'Architect', stage: 'architecture', profile: '架构师' },
  { name: 'Code', stage: 'code', profile: '工程师' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 「Agent 配置」弹窗：UI 试行占位。三个操作按钮全部置灰，默认配置下方提示功能待开发。 */
export default function AgentConfigModal({ open, onClose }: Props) {
  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Agent 配置"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Agent 配置</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* 三个操作按钮：全部置灰（待开发） */}
        <div className="mb-5 flex gap-2">
          {['＋ 添加 Agent', 'Agent 列表', '＋ 添加配置'].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              title="功能开发中"
              className="flex-1 cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-400"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Agent Loop：默认链路静态展示 */}
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Agent Loop</p>
          <div className="flex items-center gap-1.5">
            {DEFAULT_AGENT_CHAIN.map((node, i) => (
              <div key={node.name} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300">→</span>}
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <div className="text-sm font-medium text-slate-800">{node.name}</div>
                  <div className="text-xs text-slate-400">{node.profile}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部提示 */}
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
          默认配置：PM → Architect → Code。自定义 Agent、链路编排与保存复用功能开发中，敬请期待。
        </p>
      </div>
    </div>
  );
}

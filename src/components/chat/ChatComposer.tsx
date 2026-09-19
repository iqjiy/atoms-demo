import { useState } from 'react';

/**
 * 底部输入框（壳）：消息上右侧气泡，**不触发任何 agent 重跑**。
 * 全局多轮对话逻辑属 §7，本阶段仅做展示壳。
 */
export default function ChatComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');

  const send = () => {
    const v = text.trim();
    if (!v || disabled) return;
    onSend(v);
    setText('');
  };

  return (
    <div className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={1}
        placeholder="说点什么…（全局多轮对话后续开放）"
        className="max-h-32 flex-1 resize-none rounded-md border border-slate-300 p-2 text-sm focus:border-slate-400 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button
        type="button"
        onClick={send}
        disabled={disabled || !text.trim()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        发送
      </button>
    </div>
  );
}

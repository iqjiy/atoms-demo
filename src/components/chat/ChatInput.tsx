import { useState } from 'react';

/** 左栏：需求输入 + 提交。 */
export default function ChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (idea: string) => void;
  disabled?: boolean;
}) {
  const [idea, setIdea] = useState('');

  const submit = () => {
    const v = idea.trim();
    if (!v || disabled) return;
    onSubmit(v);
  };

  return (
    <div>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        className="h-28 w-full resize-none rounded-md border border-slate-300 p-2 text-sm focus:border-slate-400 focus:outline-none"
        placeholder="例如：做一个待办事项应用，支持增删改和完成标记"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !idea.trim()}
        className="mt-2 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? '生成中…' : '生成应用'}
      </button>
      <p className="mt-1 text-xs text-slate-400">⌘/Ctrl + Enter 提交</p>
    </div>
  );
}

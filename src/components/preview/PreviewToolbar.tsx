import { openInNewTab } from './PreviewFrame.js';

/** 预览工具栏：刷新 / 新窗口打开。 */
export default function PreviewToolbar({
  html,
  onRefresh,
}: {
  html: string;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        ⟳ 刷新
      </button>
      <button
        type="button"
        onClick={() => openInNewTab(html)}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        ↗ 新窗口打开
      </button>
    </div>
  );
}

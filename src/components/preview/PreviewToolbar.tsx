import { openInNewTab } from './PreviewFrame.js';

/** 预览工具栏：刷新 / 全屏切换 / 新窗口打开。 */
export default function PreviewToolbar({
  html,
  onRefresh,
  isFullscreen,
  onToggleFullscreen,
}: {
  html: string;
  onRefresh: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
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
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          {isFullscreen ? '✕ 退出全屏' : '⛶ 全屏'}
        </button>
      )}
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

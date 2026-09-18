/**
 * 右栏预览：iframe srcdoc 渲染生成的应用。
 * 安全：sandbox="allow-scripts"（允许 JS 运行），严禁加 allow-same-origin（会自移除 sandbox）。
 * opaque origin，父页面无法读其 DOM——这正是期望的隔离。
 */
export default function PreviewFrame({
  html,
  refreshKey,
}: {
  html: string;
  refreshKey?: number;
}) {
  return (
    <iframe
      key={refreshKey}
      title="生成的应用预览"
      srcDoc={html}
      sandbox="allow-scripts"
      className="h-full w-full rounded-md border border-slate-200 bg-white"
    />
  );
}

/** 「新窗口打开」：用 Blob URL 打开产物。 */
export function openInNewTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
}

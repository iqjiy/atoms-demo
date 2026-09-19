import { useEffect, useRef, useState } from 'react';
import type { ChatItem } from '../../lib/chatReducer.js';
import { renderMarkdown, renderStreamingMarkdown } from '../../lib/markdown.js';

const ROLE_LABEL: Record<string, string> = {
  pm: '产品经理',
  architect: '架构师',
  engineer: '工程师',
  coordinator: '协调',
  reviewer: '审批意见',
};

/** 流式渲染节流：每 ~120ms 渲一帧，避免每 token 全量重渲染（F-05 O(n²) 教训）。 */
function useThrottledText(text: string, active: boolean): string {
  const [out, setOut] = useState(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!active) { setOut(text); return; }
    if (timer.current) return;
    timer.current = setTimeout(() => {
      setOut(text);
      timer.current = null;
    }, 120);
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  }, [text, active]);
  return active ? out : text;
}

/** 单条聊天气泡：agent 居左、user 居右；agent 全程逐字流式 + 自愈 markdown 实时渲染（修问题2）。 */
export default function ChatBubble({ item }: { item: ChatItem }) {
  if (item.side === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-slate-900 px-3 py-2 text-sm text-white">
          {item.text}
        </div>
      </div>
    );
  }

  // 修改1B：驳回意见渲染为警示条（🚫 驳回意见 · 第 N 轮），区别于普通产物气泡
  if (item.kind === 'feedback') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="font-medium">🚫 驳回意见 · 第 {item.iteration} 轮：</span>
          {item.text}
        </div>
      </div>
    );
  }

  return <AgentBubble item={item} />;
}

function AgentBubble({ item }: { item: ChatItem }) {
  const isCode = item.stage === 'code';
  const streaming = item.status === 'streaming';
  // 流式渲染节流（仅 spec/architecture 走 markdown；code 保持只读 pre）
  const shown = useThrottledText(item.text, streaming && !isCode);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="mb-1 text-xs text-slate-400">
          {ROLE_LABEL[item.role ?? ''] ?? item.role}
          {item.iteration > 1 && <span className="ml-1 text-slate-300">· 第 {item.iteration} 轮</span>}
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
          {!item.text && streaming ? (
            <span className="flex items-center gap-1.5 text-slate-400">
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-transparent"
                aria-label="加载中"
              />
              {item.role === 'pm' ? 'PM 正在思考…' : '正在输入…'}
            </span>
          ) : isCode ? (
            // code 产物只读展示（预览在右栏 iframe），长代码折叠
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-slate-500">
              {item.text}
              {streaming && <span className="animate-pulse">▍</span>}
            </pre>
          ) : (
            // spec/architecture：流式中即自愈渲染 markdown（统一三 agent 表现），完成后定稿
            <div className="markdown-body">
              <span dangerouslySetInnerHTML={{ __html: streaming ? renderStreamingMarkdown(shown) : renderMarkdown(item.text) }} />
              {streaming && <span className="animate-pulse text-slate-400">▍</span>}
            </div>
          )}
        </div>
        {/* 修改1A：点通过/驳回后的即时反馈条（乐观更新，不等下一级 stage_start） */}
        {item.decision === 'approved' && (
          <div className="mt-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700">
            ✓ 已通过 · 第 {item.iteration} 轮
          </div>
        )}
        {item.decision === 'rejected' && (
          <div className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            ✕ 已驳回 · 第 {item.iteration} 轮
          </div>
        )}
      </div>
    </div>
  );
}

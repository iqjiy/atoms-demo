import { useEffect, useRef, useState, useCallback } from 'react';
import type { OrchestratorEvent } from '../../server/orchestrator/types.js';
import { initialState, reduceEvent, type TimelineState } from '../lib/eventReducer.js';

export interface RunHandle {
  runId: string;
  projectId: string;
}

/** 提交需求创建运行，返回 runId（随后用 useRunStream 订阅）。 */
export async function startRun(idea: string): Promise<RunHandle> {
  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea }),
  });
  if (!res.ok) throw new Error(`创建运行失败：${res.status}`);
  return (await res.json()) as RunHandle;
}

/** 订阅某 run 的 SSE 事件流，归约为时间线状态。 */
export function useRunStream(runId: string | null): TimelineState {
  const [state, setState] = useState<TimelineState>(initialState());
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => setState(initialState()), []);

  useEffect(() => {
    reset();
    if (!runId) return;

    const es = new EventSource(`/api/runs/${runId}/stream`);
    esRef.current = es;
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as OrchestratorEvent;
        setState((s) => reduceEvent(s, e));
        if (e.type === 'run_done' || e.type === 'error') es.close();
      } catch {
        /* 忽略非 JSON 心跳 */
      }
    };
    es.onerror = () => {
      // 运行结束/网络断开：EventSource 会自动重连；这里依赖服务端在 run_done 后关闭
    };
    return () => es.close();
  }, [runId, reset]);

  return state;
}

import { useEffect, useState } from 'react';

/** 把毫秒格式化为 mm:ss（任务计时器展示）。 */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 计时 hook：start 非空且 running=true 时每秒跳一次；否则定格在 start 至当前的耗时。
 * - start=null（该阶段尚未开始）：显示 00:00，不启动定时器。
 * - running=false（阶段已结束）：不再启动 interval，定格在当前值。
 */
export function useElapsed(start: number | null, running: boolean): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (start === null || !running) return;
    setNow(Date.now()); // 阶段切换瞬间立即刷新一次，避免闪烁旧值
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start, running]);

  if (start === null) return '00:00';
  return formatElapsed(now - start);
}

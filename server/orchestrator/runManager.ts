import type { OrchestratorEvent } from './types.js';

type Listener = (e: OrchestratorEvent) => void;

/**
 * 进程内运行管理器：runId → 该运行的 SSE 订阅者集合。
 * 常驻 Node 服务可持内存态；编排器 emit 时广播给所有订阅者。
 * 运行结束后 finish()，新订阅者返回 null 提示走历史回放（messages/artifacts）。
 */
export class RunManager {
  private active = new Map<string, Set<Listener>>();
  private finished = new Set<string>();

  register(runId: string): void {
    this.active.set(runId, new Set());
  }

  /** 订阅运行事件；返回取消订阅函数。运行已结束或不存在时返回 null。 */
  subscribe(runId: string, listener: Listener): (() => void) | null {
    const set = this.active.get(runId);
    if (!set) return null;
    set.add(listener);
    return () => set.delete(listener);
  }

  emit(runId: string, event: OrchestratorEvent): void {
    const set = this.active.get(runId);
    if (!set) return;
    for (const l of set) l(event);
  }

  finish(runId: string): void {
    this.active.delete(runId);
    this.finished.add(runId);
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }
}

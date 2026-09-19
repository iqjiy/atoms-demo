import type { OrchestratorEvent } from './types.js';
import type { GateDecision } from './approvalGate.js';

type Listener = (e: OrchestratorEvent) => void;

/**
 * 进程内运行管理器：runId → 该运行的 SSE 订阅者集合。
 * 常驻 Node 服务可持内存态；编排器 emit 时广播给所有订阅者。
 * 运行结束后 finish()，新订阅者返回 null 提示走历史回放（messages/artifacts）。
 */
export class RunManager {
  private active = new Map<string, Set<Listener>>();
  private finished = new Set<string>();
  private events = new Map<string, OrchestratorEvent[]>(); // 活跃 run 的事件缓存（供中途进入补发）
  /** P5：runId → 挂起的审批决策（resolve + 待审批 gate，review R4/R6）。 */
  private pendingApprovals = new Map<string, { gate: string; resolve: (d: GateDecision) => void }>();

  register(runId: string): void {
    this.active.set(runId, new Set());
    this.events.set(runId, []);
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
    this.events.get(runId)?.push(event); // 缓存供补发
    for (const l of set) l(event);
  }

  finish(runId: string): void {
    this.active.delete(runId);
    this.events.delete(runId); // 结束后清缓存（重放走 messages 落库，不靠它）
    this.finished.add(runId);
    this.pendingApprovals.delete(runId); // review R6：结束/失败时清理挂起的审批，防泄漏
  }

  /** 进行中进入者补发用：返回该 run 已缓存的事件（无则空）。 */
  history(runId: string): OrchestratorEvent[] {
    return this.events.get(runId) ?? [];
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  /** P5：ManualApprovalGate 挂起时注册 resolve + 待审批 gate，等待 HTTP 决策唤醒。 */
  registerDecision(runId: string, gate: string, resolve: (d: GateDecision) => void): void {
    this.pendingApprovals.set(runId, { gate, resolve });
  }

  /** 当前挂起审批的 gate（无挂起返回 null）。review R4：供决策路由校验决策是否对得上当前闸门。 */
  pendingGate(runId: string): string | null {
    return this.pendingApprovals.get(runId)?.gate ?? null;
  }

  /** P5：HTTP 决策路由调用，唤醒挂起的闸门；无挂起则返回 false。 */
  resolveDecision(runId: string, decision: GateDecision): boolean {
    const entry = this.pendingApprovals.get(runId);
    if (!entry) return false;
    this.pendingApprovals.delete(runId);
    entry.resolve(decision);
    return true;
  }
}

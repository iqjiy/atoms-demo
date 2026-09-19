/**
 * 审批闸门（人在回路）。非阻塞 Promise 语义。
 * 无审批模式 / CLI 用 AutoApproveGate（自动通过）；
 * P5 审批模式用 ManualApprovalGate（Promise 挂起等用户），主流程不变。
 */

/** 闸门决策：批准无意见；驳回可带修改意见（注入本级重跑 prompt）。 */
export interface GateDecision {
  approved: boolean;
  comment?: string | null;
}

/** 决策注册器：runManager 提供，把 runId → (gate + resolve) 存起来供 HTTP 决策路由唤醒。 */
export interface DecisionRegistry {
  registerDecision(runId: string, gate: string, resolve: (d: GateDecision) => void): void;
}

export interface ApprovalGate {
  /** 等待审批结果。 */
  wait(runId: string, gate: string): Promise<GateDecision>;
}

/** 自动批准：无审批模式 / CLI / 测试的默认实现。 */
export class AutoApproveGate implements ApprovalGate {
  async wait(): Promise<GateDecision> {
    return { approved: true };
  }
}

/**
 * 可暂停闸门（P5 审批模式）：wait 挂起为 Promise，
 * 由 HTTP 决策路由经 DecisionRegistry.registerDecision 注册的 resolve 唤醒。
 */
export class ManualApprovalGate implements ApprovalGate {
  constructor(private registry: DecisionRegistry) {}

  wait(runId: string, gate: string): Promise<GateDecision> {
    return new Promise((resolve) => this.registry.registerDecision(runId, gate, resolve));
  }
}

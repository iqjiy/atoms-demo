/**
 * 审批闸门（人在回路）。非阻塞 Promise 语义。
 * P2 默认用 AutoApproveGate（CLI 无人值守自动通过）；
 * P5 换成可暂停等待用户决策的实现，主流程不变。
 */
export interface ApprovalGate {
  /** 等待审批结果：true=批准继续，false=驳回。 */
  wait(runId: string, gate: string): Promise<boolean>;
}

/** 自动批准：P2/CLI 默认实现。 */
export class AutoApproveGate implements ApprovalGate {
  async wait(): Promise<boolean> {
    return true;
  }
}

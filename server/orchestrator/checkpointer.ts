import type { Stage } from '../../shared-types/index.js';
import type { NewArtifact } from './types.js';
import type { Repos } from '../db/repositories/types.js';

/**
 * 每步落库 + 断点续跑 + 历史回放（借鉴 LangGraph checkpointer）。
 * 编排器每产出一个消息/产物即写入 Repos，刷新/重启后仍可恢复。
 */
export class Checkpointer {
  constructor(private repos: Repos) {}

  async ensureProject(ownerId: string, title: string, idea: string) {
    return this.repos.projects.create({ ownerId, title, initialIdea: idea });
  }

  async ensureRun(projectId: string) {
    return this.repos.runs.create({ projectId });
  }

  async appendMessage(input: {
    runId: string;
    iteration: number;
    role: string;
    stage: Stage;
    content: string;
    causeBy: string;
  }) {
    return this.repos.messages.append(input);
  }

  async saveArtifact(runId: string, artifact: NewArtifact) {
    return this.repos.artifacts.save({
      runId,
      kind: artifact.kind,
      filename: artifact.filename,
      content: artifact.content,
    });
  }

  /** P5：落一条审批/迭代决策（批准或驳回，可带意见）。 */
  async recordApproval(runId: string, gate: string, decision: boolean, comment: string | null, iteration: number) {
    return this.repos.approvals.record({ runId, gate, decision, comment, iteration });
  }

  /** P5：更新 run 状态/当前阶段（awaiting_approval / running / completed / failed），可带 error。 */
  async setRunStatus(
    runId: string,
    status: 'running' | 'awaiting_approval' | 'completed' | 'failed',
    currentStage?: Stage | null,
    error?: string | null,
  ) {
    return this.repos.runs.setStatus(runId, status, currentStage ?? null, error ?? null);
  }
}

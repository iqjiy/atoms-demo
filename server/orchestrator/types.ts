import type { AgentMessage, Artifact, Stage } from '../../shared-types/index.js';

/** 编排器产出的待落库产物（尚无 DB 实体的 id/runId/version/createdAt）。 */
export type NewArtifact = Pick<Artifact, 'kind' | 'filename' | 'content'>;

/** 由哪个 Action 产生的消息（路由关键，复刻 MetaGPT cause_by）。 */
export type ActionName =
  | 'RunRequirementAction'
  | 'RunSpecAction'
  | 'RunArchitectureAction'
  | 'RunCodeAction';

export type AgentRole = 'coordinator' | 'pm' | 'architect' | 'engineer';

/** 推给前端/观测层的事件流（P3 SSE 直接复用）。 */
export type OrchestratorEvent =
  | { type: 'stage_start'; role: AgentRole; stage: Stage; iteration: number }
  | { type: 'token'; role: AgentRole; stage: Stage; delta: string }
  | { type: 'stage_done'; message: AgentMessage }
  | { type: 'approval_required'; runId: string; gate: string; summary: string }
  | { type: 'run_done'; runId: string; artifact: NewArtifact }
  | { type: 'error'; stage: Stage; message: string; retryable: boolean };

export type { AgentMessage, Artifact, Stage };

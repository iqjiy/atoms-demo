/** 前后端共享领域类型（与 ER 5 表对应）。 */

export type RunStatus =
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed';

export type Stage = 'requirement' | 'spec' | 'architecture' | 'code';

export interface Project {
  id: string;
  ownerId: string;
  shareId: string;
  title: string;
  initialIdea: string;
  createdAt: string;
}

export interface Run {
  id: string;
  projectId: string;
  status: RunStatus;
  currentStage: Stage | null;
  iteration: number;
  modelPlan: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AgentMessage {
  id: string;
  runId: string;
  artifactId: string | null;
  seq: number;
  iteration: number;
  role: string;
  stage: Stage;
  content: string;
  causeBy: string;
  createdAt: string;
}

export interface Artifact {
  id: string;
  runId: string;
  version: number;
  kind: 'markdown' | 'html' | 'json';
  filename: string;
  content: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  runId: string;
  gate: string;
  decision: boolean;
  comment: string | null;
  iteration: number;
  createdAt: string;
}

export interface DocFile {
  id: string;
  runId: string;
  iteration: number;
  /** 相对路径，如 pm/spec.md、src/index.html */
  path: string;
  role: string;
  stage: Stage;
  content: string;
  createdAt: string;
}

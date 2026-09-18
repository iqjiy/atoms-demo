import type {
  Project,
  Run,
  AgentMessage,
  Artifact,
  Approval,
  RunStatus,
  Stage,
} from '../../../shared-types/index.js';

export interface ProjectRepository {
  create(input: { ownerId: string; title: string; initialIdea: string }): Promise<Project>;
  getById(id: string): Promise<Project | null>;
  getByShareId(shareId: string): Promise<Project | null>;
  listByOwner(ownerId: string): Promise<Project[]>;
}

export interface RunRepository {
  create(input: { projectId: string; modelPlan?: Record<string, unknown> }): Promise<Run>;
  getById(id: string): Promise<Run | null>;
  listByProject(projectId: string): Promise<Run[]>;
  setStatus(id: string, status: RunStatus, currentStage?: Stage | null, error?: string | null): Promise<void>;
}

export interface MessageRepository {
  append(input: {
    runId: string;
    iteration: number;
    role: string;
    stage: Stage;
    content: string;
    causeBy: string;
    artifactId?: string | null;
  }): Promise<AgentMessage>;
  listByRun(runId: string): Promise<AgentMessage[]>;
}

export interface ArtifactRepository {
  save(input: { runId: string; kind: Artifact['kind']; filename: string; content: string }): Promise<Artifact>;
  latestByRun(runId: string): Promise<Artifact | null>;
  listByRun(runId: string): Promise<Artifact[]>;
}

export interface ApprovalRepository {
  record(input: { runId: string; gate: string; decision: boolean; comment: string | null; iteration: number }): Promise<Approval>;
  listByRun(runId: string): Promise<Approval[]>;
}

export interface Repos {
  projects: ProjectRepository;
  runs: RunRepository;
  messages: MessageRepository;
  artifacts: ArtifactRepository;
  approvals: ApprovalRepository;
}

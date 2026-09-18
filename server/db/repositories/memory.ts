import { randomUUID } from 'node:crypto';
import type {
  Project,
  Run,
  AgentMessage,
  Artifact,
  Approval,
  RunStatus,
  Stage,
} from '../../../shared-types/index.js';
import type { Repos } from './types.js';

const now = () => new Date().toISOString();

/** 单调递增时间戳：保证同进程内 createdAt/startedAt 严格递增，排序稳定。 */
let tick = 0;
const monoNow = () => new Date(Date.now() + ++tick).toISOString();

/**
 * 内存实现：单测与本地无 DB 时使用；与 Postgres 实现遵守同一契约（repositories.test.ts）。
 * 仅用于开发/测试，进程重启即失——生产持久化走 Postgres 实现。
 */
export function createInMemoryRepos(): Repos {
  const projects = new Map<string, Project>();
  const runs = new Map<string, Run>();
  const messages = new Map<string, AgentMessage>();
  const artifacts = new Map<string, Artifact>();
  const approvals = new Map<string, Approval>();

  return {
    projects: {
      async create({ ownerId, title, initialIdea }) {
        const p: Project = {
          id: randomUUID(),
          ownerId,
          shareId: randomUUID(),
          title,
          initialIdea,
          createdAt: monoNow(),
        };
        projects.set(p.id, p);
        return p;
      },
      async getById(id) {
        return projects.get(id) ?? null;
      },
      async getByShareId(shareId) {
        return [...projects.values()].find((p) => p.shareId === shareId) ?? null;
      },
      async listByOwner(ownerId) {
        return [...projects.values()].filter((p) => p.ownerId === ownerId);
      },
    },

    runs: {
      async create({ projectId, modelPlan = null }) {
        const r: Run = {
          id: randomUUID(),
          projectId,
          status: 'running',
          currentStage: null,
          iteration: 1,
          modelPlan,
          error: null,
          startedAt: monoNow(),
          finishedAt: null,
        };
        runs.set(r.id, r);
        return r;
      },
      async getById(id) {
        return runs.get(id) ?? null;
      },
      async listByProject(projectId) {
        return [...runs.values()]
          .filter((r) => r.projectId === projectId)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      },
      async setStatus(id, status: RunStatus, currentStage: Stage | null = null, error: string | null = null) {
        const r = runs.get(id);
        if (!r) return;
        r.status = status;
        r.currentStage = currentStage;
        r.error = error;
        if (status === 'completed' || status === 'failed') r.finishedAt = now();
      },
    },

    messages: {
      async append({ runId, iteration, role, stage, content, causeBy, artifactId = null }) {
        const seq = [...messages.values()].filter(
          (m) => m.runId === runId && m.iteration === iteration,
        ).length + 1;
        const m: AgentMessage = {
          id: randomUUID(),
          runId,
          artifactId,
          seq,
          iteration,
          role,
          stage,
          content,
          causeBy,
          createdAt: monoNow(),
        };
        messages.set(m.id, m);
        return m;
      },
      async listByRun(runId) {
        return [...messages.values()]
          .filter((m) => m.runId === runId)
          .sort((a, b) => a.iteration - b.iteration || a.seq - b.seq);
      },
    },

    artifacts: {
      async save({ runId, kind, filename, content }) {
        const version = [...artifacts.values()].filter((a) => a.runId === runId).length + 1;
        const a: Artifact = {
          id: randomUUID(),
          runId,
          version,
          kind,
          filename,
          content,
          createdAt: monoNow(),
        };
        artifacts.set(a.id, a);
        return a;
      },
      async latestByRun(runId) {
        const list = [...artifacts.values()].filter((a) => a.runId === runId);
        if (list.length === 0) return null;
        return list.sort((a, b) => b.version - a.version)[0];
      },
      async listByRun(runId) {
        return [...artifacts.values()]
          .filter((a) => a.runId === runId)
          .sort((a, b) => a.version - b.version);
      },
    },

    approvals: {
      async record({ runId, gate, decision, comment, iteration }) {
        const a: Approval = {
          id: randomUUID(),
          runId,
          gate,
          decision,
          comment,
          iteration,
          createdAt: monoNow(),
        };
        approvals.set(a.id, a);
        return a;
      },
      async listByRun(runId) {
        return [...approvals.values()]
          .filter((a) => a.runId === runId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
    },
  };
}

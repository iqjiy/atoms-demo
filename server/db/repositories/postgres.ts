import type {
  Project,
  Run,
  AgentMessage,
  Artifact,
  Approval,
  RunStatus,
  Stage,
} from '../../../shared-types/index.js';
import type { Db } from '../db.js';
import type { Repos } from './types.js';

/** 行（snake_case）→ 领域对象（camelCase）映射。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const toProject = (r: any): Project => ({
  id: r.id, ownerId: r.owner_id, shareId: r.share_id, title: r.title,
  initialIdea: r.initial_idea, createdAt: r.created_at,
});
const toRun = (r: any): Run => ({
  id: r.id, projectId: r.project_id, status: r.status, currentStage: r.current_stage,
  iteration: r.iteration, modelPlan: r.model_plan, error: r.error,
  startedAt: r.started_at, finishedAt: r.finished_at,
});
const toMessage = (r: any): AgentMessage => ({
  id: r.id, runId: r.run_id, artifactId: r.artifact_id, seq: r.seq, iteration: r.iteration,
  role: r.role, stage: r.stage, content: r.content, causeBy: r.cause_by, createdAt: r.created_at,
});
const toArtifact = (r: any): Artifact => ({
  id: r.id, runId: r.run_id, version: r.version, kind: r.kind,
  filename: r.filename, content: r.content, createdAt: r.created_at,
});
const toApproval = (r: any): Approval => ({
  id: r.id, runId: r.run_id, gate: r.gate, decision: r.decision,
  comment: r.comment, iteration: r.iteration, createdAt: r.created_at,
});

/** Postgres 实现：与内存实现遵守同一契约（repositories.test.ts 同一组断言驱动）。 */
export function createPostgresRepos(db: Db): Repos {
  return {
    projects: {
      async create({ ownerId, title, initialIdea }) {
        const { rows } = await db.query(
          `INSERT INTO projects (id, owner_id, share_id, title, initial_idea)
           VALUES (gen_random_uuid(), $1, gen_random_uuid()::text, $2, $3)
           RETURNING *`,
          [ownerId, title, initialIdea],
        );
        return toProject(rows[0]);
      },
      async getById(id) {
        const { rows } = await db.query(`SELECT * FROM projects WHERE id=$1`, [id]);
        return rows[0] ? toProject(rows[0]) : null;
      },
      async getByShareId(shareId) {
        const { rows } = await db.query(`SELECT * FROM projects WHERE share_id=$1`, [shareId]);
        return rows[0] ? toProject(rows[0]) : null;
      },
      async listByOwner(ownerId) {
        const { rows } = await db.query(
          `SELECT * FROM projects WHERE owner_id=$1 ORDER BY created_at DESC`, [ownerId]);
        return rows.map(toProject);
      },
    },

    runs: {
      async create({ projectId, modelPlan = null }) {
        const { rows } = await db.query(
          `INSERT INTO runs (id, project_id, model_plan) VALUES (gen_random_uuid(), $1, $2) RETURNING *`,
          [projectId, modelPlan ? JSON.stringify(modelPlan) : null],
        );
        return toRun(rows[0]);
      },
      async getById(id) {
        const { rows } = await db.query(`SELECT * FROM runs WHERE id=$1`, [id]);
        return rows[0] ? toRun(rows[0]) : null;
      },
      async listByProject(projectId) {
        const { rows } = await db.query(
          `SELECT * FROM runs WHERE project_id=$1 ORDER BY started_at DESC`, [projectId]);
        return rows.map(toRun);
      },
      async setStatus(id, status: RunStatus, currentStage: Stage | null = null, error: string | null = null) {
        const finished = status === 'completed' || status === 'failed';
        await db.query(
          `UPDATE runs SET status=$2, current_stage=$3, error=$4,
             finished_at = CASE WHEN $5 THEN now() ELSE finished_at END
           WHERE id=$1`,
          [id, status, currentStage, error, finished],
        );
      },
    },

    messages: {
      async append({ runId, iteration, role, stage, content, causeBy, artifactId = null }) {
        const { rows } = await db.query(
          `INSERT INTO messages (id, run_id, artifact_id, seq, iteration, role, stage, content, cause_by)
           VALUES (gen_random_uuid(), $1, $2,
             (SELECT COALESCE(MAX(seq),0)+1 FROM messages WHERE run_id=$1 AND iteration=$3),
             $3, $4, $5, $6, $7)
           RETURNING *`,
          [runId, artifactId, iteration, role, stage, content, causeBy],
        );
        return toMessage(rows[0]);
      },
      async listByRun(runId) {
        const { rows } = await db.query(
          `SELECT * FROM messages WHERE run_id=$1 ORDER BY iteration ASC, seq ASC`, [runId]);
        return rows.map(toMessage);
      },
    },

    artifacts: {
      async save({ runId, kind, filename, content }) {
        const { rows } = await db.query(
          `INSERT INTO artifacts (id, run_id, version, kind, filename, content)
           VALUES (gen_random_uuid(), $1,
             (SELECT COALESCE(MAX(version),0)+1 FROM artifacts WHERE run_id=$1),
             $2, $3, $4)
           RETURNING *`,
          [runId, kind, filename, content],
        );
        return toArtifact(rows[0]);
      },
      async latestByRun(runId) {
        const { rows } = await db.query(
          `SELECT * FROM artifacts WHERE run_id=$1 ORDER BY version DESC LIMIT 1`, [runId]);
        return rows[0] ? toArtifact(rows[0]) : null;
      },
      async listByRun(runId) {
        const { rows } = await db.query(
          `SELECT * FROM artifacts WHERE run_id=$1 ORDER BY version ASC`, [runId]);
        return rows.map(toArtifact);
      },
    },

    approvals: {
      async record({ runId, gate, decision, comment, iteration }) {
        const { rows } = await db.query(
          `INSERT INTO approvals (id, run_id, gate, decision, comment, iteration)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *`,
          [runId, gate, decision, comment, iteration],
        );
        return toApproval(rows[0]);
      },
      async listByRun(runId) {
        const { rows } = await db.query(
          `SELECT * FROM approvals WHERE run_id=$1 ORDER BY created_at ASC`, [runId]);
        return rows.map(toApproval);
      },
    },
  };
}

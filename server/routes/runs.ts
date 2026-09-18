import { Router, type Request } from 'express';
import { Orchestrator } from '../orchestrator/runner.js';
import { AutoApproveGate } from '../orchestrator/approvalGate.js';
import { Checkpointer } from '../orchestrator/checkpointer.js';
import type { RunManager } from '../orchestrator/runManager.js';
import type { LlmClient } from '../llm/client.js';
import type { Repos } from '../db/repositories/types.js';

type Req = Request & { ownerId: string };

export interface RunsDeps {
  repos: Repos;
  llm: LlmClient;
  runManager: RunManager;
}

export function runsRouter(deps: RunsDeps): Router {
  const router = Router();

  // 创建运行：先建 project/run 拿 runId 并注册，编排器后台跑；立即返回 runId。
  router.post('/runs', async (req, res) => {
    const idea = String((req.body as { idea?: string })?.idea ?? '').trim();
    if (!idea) {
      res.status(400).json({ error: 'idea is required' });
      return;
    }
    const ownerId = (req as Req).ownerId;

    const project = await deps.repos.projects.create({
      ownerId, title: idea.slice(0, 30), initialIdea: idea,
    });
    const run = await deps.repos.runs.create({ projectId: project.id });
    deps.runManager.register(run.id);

    const orc = new Orchestrator({
      llm: deps.llm,
      gate: new AutoApproveGate(), // P5 换成可暂停审批
      checkpointer: new Checkpointer(deps.repos),
      emit: (e) => deps.runManager.emit(run.id, e),
    });

    // 后台运行，不阻塞响应；结束后 finish（新订阅者走历史回放）
    orc.runProject({ idea, ownerId, projectId: project.id, runId: run.id })
      .catch((e) => deps.runManager.emit(run.id, {
        type: 'error', stage: 'code', message: String(e), retryable: true,
      }))
      .finally(() => deps.runManager.finish(run.id));

    res.json({ runId: run.id, projectId: project.id, status: 'running' });
  });

  return router;
}

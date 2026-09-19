import { Router, type Request } from 'express';
import { Orchestrator } from '../orchestrator/runner.js';
import { AutoApproveGate, ManualApprovalGate } from '../orchestrator/approvalGate.js';
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
    const body = req.body as { idea?: string; mode?: string };
    const idea = String(body?.idea ?? '').trim();
    if (!idea) {
      res.status(400).json({ error: 'idea is required' });
      return;
    }
    // P5 双模式：'approve' 逐级审批（每级挂起等人）；默认 'auto' 一路跑完（现状）
    const approve = body?.mode === 'approve';
    const ownerId = (req as Req).ownerId;

    const project = await deps.repos.projects.create({
      ownerId, title: idea.slice(0, 30), initialIdea: idea,
    });
    const run = await deps.repos.runs.create({ projectId: project.id });
    deps.runManager.register(run.id);

    const orc = new Orchestrator({
      llm: deps.llm,
      gate: approve ? new ManualApprovalGate(deps.runManager) : new AutoApproveGate(),
      checkpointer: new Checkpointer(deps.repos),
      emit: (e) => deps.runManager.emit(run.id, e),
    });

    // 后台运行，不阻塞响应；结束后 finish（新订阅者走历史回放）
    orc.runProject({ idea, ownerId, projectId: project.id, runId: run.id })
      .catch(async (e) => {
        console.error('[run] orchestrator error:', e);
        // review C4：错误事件用 run 落库的真实 currentStage，而非硬编码 'code'（避免误标未运行的阶段）
        const r = await deps.repos.runs.getById(run.id).catch(() => null);
        deps.runManager.emit(run.id, {
          type: 'error',
          stage: r?.currentStage ?? 'code',
          message: String(e),
          retryable: false, // 异常中止非「可重试的驳回」，不再误导 UI
        });
      })
      .finally(() => deps.runManager.finish(run.id));

    res.json({ runId: run.id, projectId: project.id, status: 'running' });
  });

  return router;
}

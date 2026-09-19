import { Router, type Request } from 'express';
import type { RunManager } from '../orchestrator/runManager.js';
import type { Repos } from '../db/repositories/types.js';

type Req = Request & { ownerId: string };

/**
 * 审批决策路由（P5）：用户对某道闸门批准/驳回（可带意见）。
 * 唤醒 runManager 里挂起的闸门 Promise；落库由编排器在闸门返回后统一记录。
 * 安全：仅该 run 所属 project 的 owner 可决策（review F-4）。
 */
export function decisionRouter(repos: Repos, runManager: RunManager): Router {
  const router = Router();

  router.post('/runs/:id/decision', async (req, res) => {
    const runId = req.params.id;
    const body = req.body as { decision?: boolean; comment?: string; gate?: string };
    if (typeof body?.decision !== 'boolean') {
      res.status(400).json({ error: 'decision (boolean) is required' });
      return;
    }

    const run = await repos.runs.getById(runId);
    if (!run) {
      res.status(404).json({ error: 'run not found' });
      return;
    }
    // 归属校验：只有该 run 所属 project 的 owner 能决策，防匿名访客劫持（review F-4）
    const project = await repos.projects.getById(run.projectId);
    if (!project || project.ownerId !== (req as unknown as Req).ownerId) {
      res.status(403).json({ error: 'forbidden: not the owner of this run' });
      return;
    }
    if (run.status !== 'awaiting_approval') {
      res.status(409).json({ error: `run is not awaiting approval (status=${run.status})` });
      return;
    }

    // review R4：校验决策的 gate 与当前实际挂起的闸门一致，防陈旧卡片把决策落到错的阶段
    const pendingGate = runManager.pendingGate(runId);
    if (pendingGate && body.gate && body.gate !== pendingGate) {
      res.status(409).json({ error: `gate mismatch: run is awaiting '${pendingGate}', got '${body.gate}'` });
      return;
    }

    const resolved = runManager.resolveDecision(runId, {
      approved: body.decision,
      comment: body.comment ?? null,
    });
    if (!resolved) {
      // 状态是等待但内存 Promise 已丢（服务重启）——无法恢复，引导重开
      res.status(410).json({ error: 'run approval wait was lost (server restarted); please resubmit' });
      return;
    }

    res.json({ ok: true });
  });

  return router;
}

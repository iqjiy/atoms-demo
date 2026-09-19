import { Router } from 'express';
import type { Repos } from '../db/repositories/types.js';

/** 读单个 run 的状态（P5F 关页重放：返回 status + currentStage 供重建审批卡）。 */
export function runStatusRouter(repos: Repos): Router {
  const router = Router();

  router.get('/runs/:id', async (req, res) => {
    const run = await repos.runs.getById(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'run not found' });
      return;
    }
    res.json({
      run: {
        id: run.id,
        projectId: run.projectId,
        status: run.status,
        currentStage: run.currentStage,
        iteration: run.iteration,
        error: run.error, // review C3：透出真实失败原因，重放不再丢
      },
    });
  });

  return router;
}

import { Router } from 'express';
import type { Repos } from '../db/repositories/types.js';

/** 读回某 run 的全部产物版本。 */
export function artifactsRouter(repos: Repos): Router {
  const router = Router();
  router.get('/runs/:id/artifacts', async (req, res) => {
    const artifacts = await repos.artifacts.listByRun(req.params.id);
    res.json({ artifacts });
  });
  return router;
}

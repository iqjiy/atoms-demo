import { Router } from 'express';
import type { Repos } from '../db/repositories/types.js';

/** 读某 run 的文件树（文档系统主区数据源）。 */
export function filesRouter(repos: Repos): Router {
  const router = Router();
  router.get('/runs/:id/files', async (req, res) => {
    const files = await repos.files.listByRun(req.params.id);
    res.json({ files });
  });
  return router;
}

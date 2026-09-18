import { Router, type Request } from 'express';
import type { Repos } from '../db/repositories/types.js';

type Req = Request & { ownerId: string };

export function projectsRouter(repos: Repos): Router {
  const router = Router();

  // 按匿名 ownerId 过滤返回该用户的项目列表
  router.get('/projects', (req, res) => {
    const ownerId = (req as Req).ownerId;
    repos.projects
      .listByOwner(ownerId)
      .then((projects) => res.json({ projects }))
      .catch(() => res.status(500).json({ error: 'failed to list projects' }));
  });

  return router;
}

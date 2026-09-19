import { Router, type Request } from 'express';
import type { Repos } from '../db/repositories/types.js';

type Req = Request & { ownerId: string };

export function projectsRouter(repos: Repos): Router {
  const router = Router();

  // 按匿名 ownerId 过滤返回该用户的项目列表（P5F：带 latestRun 摘要供会话列表/关页重放）
  router.get('/projects', async (req, res) => {
    const ownerId = (req as Req).ownerId;
    try {
      const projects = await repos.projects.listByOwner(ownerId);
      const withRun = await Promise.all(
        projects.map(async (p) => {
          const runs = await repos.runs.listByProject(p.id);
          const latest = runs[0] ?? null;
          return {
            ...p,
            latestRun: latest
              ? { runId: latest.id, status: latest.status, currentStage: latest.currentStage }
              : null,
          };
        }),
      );
      res.json({ projects: withRun });
    } catch {
      res.status(500).json({ error: 'failed to list projects' });
    }
  });

  return router;
}

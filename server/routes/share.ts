import { Router } from 'express';
import type { Repos } from '../db/repositories/types.js';

/**
 * 只读分享页数据源（/p/:shareId 后端）。
 * 安全边界：capability URL（shareId 不可枚举），公开面 = 这一个 GET，写面 = 零。
 * 字段裁剪：不回传 project.ownerId（防追踪同一作者）、run.id（防拿 runId 调内部写接口）。
 * 详见 task/research/share-page.md。
 */
export function shareRouter(repos: Repos): Router {
  const router = Router();

  router.get('/share/:shareId', async (req, res) => {
    try {
      const project = await repos.projects.getByShareId(req.params.shareId);
      if (!project) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const runs = await repos.runs.listByProject(project.id); // 按 started_at DESC
      const run = runs[0];
      if (!run) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const [messages, artifact, files] = await Promise.all([
        repos.messages.listByRun(run.id),
        repos.artifacts.latestByRun(run.id),
        repos.files.listByRun(run.id),
      ]);

      // 分享内容一旦 completed 基本不变 → 短缓存；noindex 防搜索引擎收录
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.json({
        project: { title: project.title, initialIdea: project.initialIdea, createdAt: project.createdAt },
        run: { status: run.status, currentStage: run.currentStage, iteration: run.iteration, startedAt: run.startedAt, finishedAt: run.finishedAt },
        messages,
        artifact: artifact ?? null,
        files,
      });
    } catch {
      res.status(500).json({ error: 'failed to load share' });
    }
  });

  return router;
}

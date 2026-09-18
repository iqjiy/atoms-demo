import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.js';
import { projectsRouter } from './routes/projects.js';
import { OWNER_COOKIE, resolveOwner } from './identity/identityService.js';
import type { Repos } from './db/repositories/types.js';
import { createInMemoryRepos } from './db/repositories/memory.js';

/**
 * 匿名身份中间件：解析/签发匿名 ownerId，首次访问写 HttpOnly Cookie。
 * 挂载在所有 /api 路由之前，保证每个请求都有 ownerId 可用。
 */
function identityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const resolved = resolveOwner(req.cookies?.[OWNER_COOKIE]);
  (req as Request & { ownerId: string }).ownerId = resolved.ownerId;
  if (resolved.isNew) {
    res.cookie(OWNER_COOKIE, resolved.ownerId, resolved.cookie);
  }
  next();
}

/** 构建 Express 应用（路由 + 中间件）。与监听分离，便于 supertest 集成测试。 */
export function createApp(repos: Repos = createInMemoryRepos()): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(identityMiddleware);

  app.use('/api', healthRouter);
  app.use('/api', projectsRouter(repos));

  return app;
}

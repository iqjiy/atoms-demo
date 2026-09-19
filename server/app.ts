import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.js';
import { projectsRouter } from './routes/projects.js';
import { runsRouter } from './routes/runs.js';
import { decisionRouter } from './routes/decision.js';
import { streamRouter } from './routes/stream.js';
import { messagesRouter } from './routes/messages.js';
import { artifactsRouter } from './routes/artifacts.js';
import { runStatusRouter } from './routes/runStatus.js';
import { filesRouter } from './routes/files.js';
import { OWNER_COOKIE, resolveOwner } from './identity/identityService.js';
import type { Repos } from './db/repositories/types.js';
import { createInMemoryRepos } from './db/repositories/memory.js';
import { RunManager } from './orchestrator/runManager.js';
import type { LlmClient } from './llm/client.js';
import { FakeLlmClient } from './llm/fakeClient.js';

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

export interface AppOptions {
  llm?: LlmClient;
}

/** 构建 Express 应用（路由 + 中间件）。与监听分离，便于 supertest 集成测试。 */
export function createApp(repos: Repos = createInMemoryRepos(), opts: AppOptions = {}): Express {
  const llm = opts.llm ?? new FakeLlmClient();
  const runManager = new RunManager();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(identityMiddleware);

  app.use('/api', healthRouter);
  app.use('/api', projectsRouter(repos));
  app.use('/api', runsRouter({ repos, llm, runManager }));
  app.use('/api', decisionRouter(repos, runManager));
  app.use('/api', streamRouter(repos, runManager));
  app.use('/api', messagesRouter(repos));
  app.use('/api', artifactsRouter(repos));
  app.use('/api', runStatusRouter(repos));
  app.use('/api', filesRouter(repos));

  return app;
}

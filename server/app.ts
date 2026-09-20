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
import { shareRouter } from './routes/share.js';
import { OWNER_COOKIE, resolveOwner } from './identity/identityService.js';
import { accessGate, makeLoginHandler } from './auth/accessGate.js';
import { createRateLimiter } from './auth/rateLimit.js';
import { env } from './shared/env.js';
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
  /** 覆盖环境读取（测试用）：默认取 process.env。 */
  accessKey?: string;
  rateLimitRpm?: number;
  maxGlobalRunsPerDay?: number;
}

/** 构建 Express 应用（路由 + 中间件）。与监听分离，便于 supertest 集成测试。 */
export function createApp(repos: Repos = createInMemoryRepos(), opts: AppOptions = {}): Express {
  const llm = opts.llm ?? new FakeLlmClient();
  const runManager = new RunManager();
  const accessKey = opts.accessKey ?? env.accessKey;
  const rateLimitRpm = opts.rateLimitRpm ?? env.rateLimitRpm;
  const maxGlobalRunsPerDay = opts.maxGlobalRunsPerDay ?? env.maxGlobalRunsPerDay;
  const rateLimiter = createRateLimiter();

  const app = express();
  // Render 在反代之后：必须 trust proxy 才能拿到真实访客 IP，否则 IP 限流失效。
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use(identityMiddleware);

  // 口令门禁（方案 A）：仅当配了 ACCESS_KEY 才启用；/api/health 与只读 /api/share/* 始终放行。
  // 分享页是给人零门槛看的作品快照，不耗 LLM，故不需口令；花钱的写接口（POST /runs、decision）被门禁护住。
  if (accessKey) {
    const validTokens = new Set<string>(); // 进程内存即可；重启则重输口令（demo 可接受）
    app.post('/api/auth', makeLoginHandler({ accessKey, validTokens }));
    app.use('/api', (req, res, next) => {
      if (req.path === '/health' || req.path.startsWith('/share/')) return next();
      return accessGate({ validTokens })(req, res, next);
    });
  }

  // IP 级限流（方案 B）：常开，挡脚本刷接口。
  app.use('/api', rateLimiter.ipRateLimit(rateLimitRpm));

  app.use('/api', healthRouter);
  app.use('/api', projectsRouter(repos));
  app.use('/api', runsRouter({ repos, llm, runManager, globalRunLimit: rateLimiter.globalRunLimit(maxGlobalRunsPerDay) }));
  app.use('/api', decisionRouter(repos, runManager));
  app.use('/api', streamRouter(repos, runManager));
  app.use('/api', messagesRouter(repos));
  app.use('/api', artifactsRouter(repos));
  app.use('/api', runStatusRouter(repos));
  app.use('/api', filesRouter(repos));
  app.use('/api', shareRouter(repos));

  return app;
}

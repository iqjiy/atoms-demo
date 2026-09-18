import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { env } from './shared/env.js';
import { createNeonDb } from './db/client.js';
import { createPostgresRepos } from './db/repositories/postgres.js';
import { migrate } from './db/migrate.js';
import type { Repos } from './db/repositories/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 有 DATABASE_URL 用 Postgres（持久化），否则回退内存实现（仅开发/测试）。 */
async function buildRepos(): Promise<Repos | undefined> {
  if (!env.databaseUrl) {
    console.warn('[db] DATABASE_URL 未配置，使用内存实现（重启即失）');
    return undefined;
  }
  await migrate(env.databaseUrl); // 幂等建表（IF NOT EXISTS）
  console.log('[db] 已连接 Neon Postgres');
  return createPostgresRepos(createNeonDb(env.databaseUrl));
}

const repos = await buildRepos();
const app = createApp(repos);

// 生产模式：托管 Vite 构建产物（同源部署，SPA 回退到 index.html）
if (env.isProd) {
  const distDir = path.resolve(__dirname, '../../dist');
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

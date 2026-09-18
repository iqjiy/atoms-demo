import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { env } from './shared/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();

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

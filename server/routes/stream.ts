import { Router } from 'express';
import type { RunManager } from '../orchestrator/runManager.js';
import type { Repos } from '../db/repositories/types.js';
import type { OrchestratorEvent } from '../orchestrator/types.js';

/**
 * SSE 流式端点：订阅某 run 的实时事件；运行已结束则回放已落库消息后补 run_done。
 * 响应头防网关缓冲（X-Accel-Buffering: no）。
 */
export function streamRouter(repos: Repos, runManager: RunManager): Router {
  const router = Router();

  router.get('/runs/:id/stream', async (req, res) => {
    const runId = req.params.id;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (e: OrchestratorEvent) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    };

    const unsub = runManager.subscribe(runId, send);
    if (unsub) {
      // 活跃运行：先补发已流出的历史（中途进入不再空白），再实时转发直到 run_done / error 关闭
      for (const e of runManager.history(runId)) send(e);
      const closer = runManager.subscribe(runId, (e) => {
        if (e.type === 'run_done' || e.type === 'error') {
          res.end();
        }
      });
      req.on('close', () => {
        unsub();
        closer?.();
      });
      return;
    }

    // 已结束/不存在：回放已落库消息 + 最新 artifact，作为 run_done 收尾
    const messages = await repos.messages.listByRun(runId);
    for (const m of messages) {
      send({ type: 'stage_start', role: m.role as never, stage: m.stage, iteration: m.iteration });
      send({ type: 'token', role: m.role as never, stage: m.stage, delta: m.content });
      send({ type: 'stage_done', message: m });
    }
    const artifact = await repos.artifacts.latestByRun(runId);
    if (artifact) {
      send({
        type: 'run_done',
        runId,
        artifact: { kind: artifact.kind, filename: artifact.filename, content: artifact.content },
      });
    }
    res.end();
  });

  return router;
}

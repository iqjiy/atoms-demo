import { Router } from 'express';
import type { Repos } from '../db/repositories/types.js';

/** 读回某 run 的全部消息（历史回放 / 断线重连）。 */
export function messagesRouter(repos: Repos): Router {
  const router = Router();
  router.get('/runs/:id/messages', async (req, res) => {
    const messages = await repos.messages.listByRun(req.params.id);
    res.json({ messages });
  });
  return router;
}

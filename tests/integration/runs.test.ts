import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { FakeLlmClient } from '../../server/llm/fakeClient.js';

describe('POST /api/runs + GET /api/runs/:id/stream', () => {
  it('创建运行返回 runId/projectId/status=running', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const res = await request(app).post('/api/runs').send({ idea: '做一个待办应用' });
    expect(res.status).toBe(200);
    expect(res.body.runId).toBeTruthy();
    expect(res.body.projectId).toBeTruthy();
    expect(res.body.status).toBe('running');
  });

  it('空需求返回 400', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const res = await request(app).post('/api/runs').send({ idea: '' });
    expect(res.status).toBe(400);
  });

  it('运行完成后可读回 messages 与 artifacts', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const create = await request(app).post('/api/runs').send({ idea: '做一个待办应用' });
    const runId = create.body.runId;

    // 等待后台编排完成（Fake 很快）
    await waitFor(async () => {
      const m = await request(app).get(`/api/runs/${runId}/messages`);
      return m.body.messages.length >= 4;
    });

    const msgs = await request(app).get(`/api/runs/${runId}/messages`);
    expect(msgs.body.messages.map((m: { stage: string }) => m.stage))
      .toEqual(['requirement', 'spec', 'architecture', 'code']);

    const arts = await request(app).get(`/api/runs/${runId}/artifacts`);
    expect(arts.body.artifacts.length).toBeGreaterThanOrEqual(1);
    expect(arts.body.artifacts[0].content).toContain('<');
  });

  it('GET /api/runs/:id/stream 返回 SSE 事件流（含 run_done）', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const create = await request(app).post('/api/runs').send({ idea: 'x' });
    const runId = create.body.runId;
    await waitFor(async () => {
      const m = await request(app).get(`/api/runs/${runId}/messages`);
      return m.body.messages.length >= 4;
    });

    const res = await request(app)
      .get(`/api/runs/${runId}/stream`)
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => cb(null, data));
      });

    expect(res.headers['content-type']).toContain('text/event-stream');
    const body = res.body as string;
    expect(body).toContain('stage_start');
    expect(body).toContain('run_done');
  });
});

async function waitFor(cond: () => Promise<boolean>, timeoutMs = 5000, interval = 50) {
  const start = Date.now();
  for (;;) {
    if (await cond()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, interval));
  }
}

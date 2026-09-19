import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { FakeLlmClient } from '../../server/llm/fakeClient.js';

// 固定 owner，保证同一 run 的创建与决策同属一人（决策路由有归属校验 review F-4）
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const asOwner = (r: request.Test) => r.set('Cookie', `ownerId=${OWNER}`);

describe('POST /api/runs/:id/decision（P5 审批决策）', () => {
  it('审批模式：创建后挂起于闸门1，批准后继续至完成', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const create = await asOwner(request(app).post('/api/runs')).send({ idea: '做一个待办应用', mode: 'approve' });
    const runId = create.body.runId;

    // 等待挂起到第一道闸门（spec）
    await waitFor(async () => {
      const r = await request(app).get(`/api/runs/${runId}/messages`);
      return r.body.messages.some((m: { stage: string }) => m.stage === 'spec');
    });

    // 依次批准三道闸门；每批准一道，等下一级产物出现
    for (const [gate, nextStage] of [['spec', 'architecture'], ['architecture', 'code']] as const) {
      const res = await asOwner(request(app).post(`/api/runs/${runId}/decision`)).send({ decision: true, gate });
      expect(res.status).toBe(200);
      await waitFor(async () => {
        const r = await request(app).get(`/api/runs/${runId}/messages`);
        return r.body.messages.some((m: { stage: string }) => m.stage === nextStage);
      });
    }
    // 批准 code 闸门
    const fin = await asOwner(request(app).post(`/api/runs/${runId}/decision`)).send({ decision: true, gate: 'code' });
    expect(fin.status).toBe(200);

    // 最终落库完整四阶段
    await waitFor(async () => {
      const a = await request(app).get(`/api/runs/${runId}/artifacts`);
      return a.body.artifacts.length >= 1;
    });
    const msgs = await request(app).get(`/api/runs/${runId}/messages`);
    expect(msgs.body.messages.map((m: { stage: string }) => m.stage))
      .toEqual(['requirement', 'spec', 'architecture', 'code']);
  });

  it('无审批模式（默认/缺省 mode）：一路跑完无需决策', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const create = await request(app).post('/api/runs').send({ idea: '做一个待办应用' });
    const runId = create.body.runId;
    await waitFor(async () => {
      const a = await request(app).get(`/api/runs/${runId}/artifacts`);
      return a.body.artifacts.length >= 1;
    });
    const msgs = await request(app).get(`/api/runs/${runId}/messages`);
    expect(msgs.body.messages.length).toBeGreaterThanOrEqual(4);
  });

  it('非等待态的 run 决策返回 409', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const create = await asOwner(request(app).post('/api/runs')).send({ idea: 'x' }); // auto 模式
    const runId = create.body.runId;
    await waitFor(async () => {
      const a = await request(app).get(`/api/runs/${runId}/artifacts`);
      return a.body.artifacts.length >= 1;
    });
    const res = await asOwner(request(app).post(`/api/runs/${runId}/decision`)).send({ decision: true, gate: 'spec' });
    expect(res.status).toBe(409);
  });

  it('decision 非 boolean 返回 400；不存在的 run 返回 404', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const bad = await request(app).post('/api/runs/some-id/decision').send({ gate: 'spec' });
    expect(bad.status).toBe(400);
    const notFound = await request(app).post('/api/runs/00000000-0000-0000-0000-000000000000/decision').send({ decision: true });
    expect(notFound.status).toBe(404);
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

describe('POST /api/runs/:id/decision 归属校验（review F-4）', () => {
  it('非该 run 所有者的访客决策返回 403', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    // 用户 A（固定 owner cookie）创建审批模式 run
    const ownerA = '11111111-1111-1111-1111-111111111111';
    const create = await request(app)
      .post('/api/runs')
      .set('Cookie', `ownerId=${ownerA}`)
      .send({ idea: '做一个待办应用', mode: 'approve' });
    const runId = create.body.runId;
    await waitFor(async () => {
      const r = await request(app).get(`/api/runs/${runId}/messages`);
      return r.body.messages.some((m: { stage: string }) => m.stage === 'spec');
    });

    // 用户 B（不同 owner）尝试驳回 A 的 run → 应 403
    const ownerB = '22222222-2222-2222-2222-222222222222';
    const res = await request(app)
      .post(`/api/runs/${runId}/decision`)
      .set('Cookie', `ownerId=${ownerB}`)
      .send({ decision: false, comment: '劫持' });
    expect(res.status).toBe(403);

    // 用户 A 自己批准 → 200
    const ok = await request(app)
      .post(`/api/runs/${runId}/decision`)
      .set('Cookie', `ownerId=${ownerA}`)
      .send({ decision: true, gate: 'spec' });
    expect(ok.status).toBe(200);
  });
});

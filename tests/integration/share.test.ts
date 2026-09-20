import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { FakeLlmClient } from '../../server/llm/fakeClient.js';

async function waitFor(cond: () => Promise<boolean>, timeoutMs = 5000, interval = 50) {
  const start = Date.now();
  for (;;) {
    if (await cond()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, interval));
  }
}

describe('GET /api/share/:shareId（只读分享快照）', () => {
  it('shareId 不存在 → 404', async () => {
    const app = createApp();
    const res = await request(app).get('/api/share/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('完成的作品返回只读快照：project/run状态/messages/artifact/files 齐全', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const owner = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const create = await request(app)
      .post('/api/runs')
      .set('Cookie', `ownerId=${owner}`)
      .send({ idea: '做一个待办应用' });
    const runId = create.body.runId as string;
    await waitFor(async () => {
      const r = await request(app).get(`/api/runs/${runId}`);
      return r.body.run.status === 'completed';
    });

    // 拿 shareId（作者视角列表已带回）
    const list = await request(app).get('/api/projects').set('Cookie', `ownerId=${owner}`);
    const shareId = list.body.projects.find((p: { id: string }) => p.id === create.body.projectId).shareId;
    expect(shareId).toBeTruthy();

    const res = await request(app).get(`/api/share/${shareId}`);
    expect(res.status).toBe(200);
    expect(res.body.project.title).toBeTruthy();
    expect(res.body.project.initialIdea).toBe('做一个待办应用');
    expect(res.body.run.status).toBe('completed');
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThan(0);
    expect(res.body.artifact).toBeTruthy();
    expect(res.body.artifact.content).toBeTruthy();
    expect(Array.isArray(res.body.files)).toBe(true);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });

  it('安全裁剪：不回传 ownerId / run.id（防从分享页拿 runId 调内部写接口）', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const owner = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    const create = await request(app)
      .post('/api/runs')
      .set('Cookie', `ownerId=${owner}`)
      .send({ idea: '做一个计数器' });
    const runId = create.body.runId as string;
    await waitFor(async () => {
      const r = await request(app).get(`/api/runs/${runId}`);
      return r.body.run.status === 'completed';
    });
    const list = await request(app).get('/api/projects').set('Cookie', `ownerId=${owner}`);
    const shareId = list.body.projects.find((p: { id: string }) => p.id === create.body.projectId).shareId;

    const res = await request(app).get(`/api/share/${shareId}`);
    expect(res.status).toBe(200);
    expect(res.body.project.ownerId).toBeUndefined();
    expect(res.body.run.id).toBeUndefined();
  });
});

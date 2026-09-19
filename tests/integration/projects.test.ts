import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';

describe('GET /api/projects', () => {
  it('returns an empty projects array for a fresh owner', async () => {
    const app = createApp();
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('projects');
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  it('scopes projects to the ownerId cookie', async () => {
    const app = createApp();
    const agent = request.agent(app);
    // 首次请求建立 ownerId cookie
    await agent.get('/api/health');
    const res = await agent.get('/api/projects');
    expect(res.status).toBe(200);
    for (const p of res.body.projects) {
      expect(p).toHaveProperty('ownerId');
    }
  });
});

describe('GET /api/projects 会话列表（P5F：带 latestRun 摘要）', () => {
  it('每个项目带 latestRun { runId, status, currentStage }，供左栏会话列表与关页重放', async () => {
    const app = createApp();
    const owner = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    // 该 owner 创建一个 run（auto 模式跑完）
    const create = await request(app).post('/api/runs').set('Cookie', `ownerId=${owner}`).send({ idea: '做一个计数器' });
    const runId = create.body.runId;
    await waitFor(async () => {
      const a = await request(app).get(`/api/runs/${runId}/artifacts`);
      return a.body.artifacts.length >= 1;
    });

    const res = await request(app).get('/api/projects').set('Cookie', `ownerId=${owner}`);
    expect(res.status).toBe(200);
    const proj = res.body.projects.find((p: { id: string }) => p.id === create.body.projectId);
    expect(proj).toBeTruthy();
    expect(proj.latestRun).toBeTruthy();
    expect(proj.latestRun.runId).toBe(runId);
    expect(proj.latestRun.status).toBe('completed');
  });
});

describe('GET /api/runs/:id（P5F：关页重放）', () => {
  it('返回 run 的 status 与 currentStage', async () => {
    const app = createApp();
    const owner = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const create = await request(app).post('/api/runs').set('Cookie', `ownerId=${owner}`).send({ idea: 'x' });
    const runId = create.body.runId;
    await waitFor(async () => {
      const a = await request(app).get(`/api/runs/${runId}/artifacts`);
      return a.body.artifacts.length >= 1;
    });
    const res = await request(app).get(`/api/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.run.status).toBe('completed');
    expect(res.body.run).toHaveProperty('currentStage');
  });

  it('不存在的 run 返回 404', async () => {
    const app = createApp();
    const res = await request(app).get('/api/runs/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
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

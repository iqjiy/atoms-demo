import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { FakeLlmClient } from '../../server/llm/fakeClient.js';

describe('访问口令门禁（ACCESS_KEY）', () => {
  it('未授权访问写接口 → 401；/api/health 始终放行', async () => {
    const app = createApp(undefined, { accessKey: 'k1' });
    expect((await request(app).post('/api/runs').send({ idea: 'x' })).status).toBe(401);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('错口令 → 401；对口令 → 200 + HttpOnly cookie，随后带 cookie 可访问', async () => {
    const app = createApp(undefined, { accessKey: 'k1' });
    expect((await request(app).post('/api/auth').send({ key: 'wrong' })).status).toBe(401);

    const agent = request.agent(app);
    const login = await agent.post('/api/auth').send({ key: 'k1' });
    expect(login.status).toBe(200);
    const cookie = Array.isArray(login.headers['set-cookie'])
      ? login.headers['set-cookie'].join(';')
      : String(login.headers['set-cookie']);
    expect(cookie).toMatch(/atoms_access=/);
    expect(cookie).toMatch(/HttpOnly/i);

    // 带 cookie 创建 run 放行
    expect((await agent.post('/api/runs').send({ idea: '做一个计数器' })).status).toBe(200);
  });

  it('只读分享页 /api/share/* 不需口令（公开快照，不耗 LLM）', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient(), accessKey: 'k1' });
    // 无 cookie 直接打分享端点：应到得了路由（404 而非 401）
    const res = await request(app).get('/api/share/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('未配 ACCESS_KEY → 全放行（本地开发不被打断）', async () => {
    const app = createApp(undefined, { accessKey: '' });
    expect((await request(app).post('/api/runs').send({ idea: 'x' })).status).toBe(200);
  });
});

describe('限流（rate limit）', () => {
  it('IP 每分钟超限 → 429', async () => {
    const app = createApp(undefined, { rateLimitRpm: 3 });
    await request(app).get('/api/health');
    await request(app).get('/api/health');
    await request(app).get('/api/health');
    const res = await request(app).get('/api/health'); // 第 4 次超限
    expect(res.status).toBe(429);
  });

  it('全局每日 run 数到顶 → 429', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient(), maxGlobalRunsPerDay: 2 });
    expect((await request(app).post('/api/runs').send({ idea: 'a' })).status).toBe(200);
    expect((await request(app).post('/api/runs').send({ idea: 'b' })).status).toBe(200);
    const third = await request(app).post('/api/runs').send({ idea: 'c' });
    expect(third.status).toBe(429);
  });
});

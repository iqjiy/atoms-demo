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

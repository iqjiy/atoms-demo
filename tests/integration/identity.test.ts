import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';

describe('anonymous identity issuance', () => {
  it('sets an HttpOnly ownerId cookie on first request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookie).toMatch(/ownerId=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('does not re-issue when a valid ownerId cookie is sent', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const first = await agent.get('/api/health');
    const second = await agent.get('/api/health');
    expect(second.headers['set-cookie']).toBeUndefined();
    expect(first.headers['set-cookie']).toBeDefined();
  });
});

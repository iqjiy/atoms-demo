import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { FakeLlmClient } from '../../server/llm/fakeClient.js';

describe('GET /api/runs/:id/files', () => {
  it('运行完成后可读回该 run 的文件树（pm/architect/src）', async () => {
    const app = createApp(undefined, { llm: new FakeLlmClient() });
    const create = await request(app).post('/api/runs').send({ idea: '做一个待办应用' });
    const runId = create.body.runId;
    // 等完成
    const start = Date.now();
    for (;;) {
      const r = await request(app).get(`/api/runs/${runId}`);
      if (r.body.run.status === 'completed') break;
      if (Date.now() - start > 5000) throw new Error('timeout');
      await new Promise((r2) => setTimeout(r2, 50));
    }
    const res = await request(app).get(`/api/runs/${runId}/files`);
    expect(res.status).toBe(200);
    const paths = res.body.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('pm/spec.md');
    expect(paths).toContain('architect/arch.md');
    expect(paths.some((p: string) => p.startsWith('src/'))).toBe(true);
  });
});

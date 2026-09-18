import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNeonDb } from '../../server/db/client.js';
import { createPostgresRepos } from '../../server/db/repositories/postgres.js';
import { repositoryContract } from '../unit/repositoryContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;

// 无 DATABASE_URL 时跳过：真实库集成测试为手动/有凭据时运行，不进默认 CI。
const runIt = DATABASE_URL ? describe : describe.skip;

runIt('Postgres Repository（真实 Neon，契约复用）', () => {
  beforeAll(async () => {
    const db = createNeonDb(DATABASE_URL!);
    const ddl = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8');
    await db.query(ddl);
  });

  repositoryContract(() => createPostgresRepos(createNeonDb(DATABASE_URL!)));
});

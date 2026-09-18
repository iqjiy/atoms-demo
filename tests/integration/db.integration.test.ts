import { describe, beforeAll } from 'vitest';
import { createNeonDb } from '../../server/db/client.js';
import { createPostgresRepos } from '../../server/db/repositories/postgres.js';
import { migrate } from '../../server/db/migrate.js';
import { repositoryContract } from '../unit/repositoryContract.js';

const DATABASE_URL = process.env.DATABASE_URL;

// 无 DATABASE_URL 时跳过：真实库集成测试为手动/有凭据时运行，不进默认 CI。
const runIt = DATABASE_URL ? describe : describe.skip;

runIt('Postgres Repository（真实 Neon，契约复用）', () => {
  beforeAll(async () => {
    await migrate(DATABASE_URL!);
  });

  repositoryContract(() => createPostgresRepos(createNeonDb(DATABASE_URL!)));
});

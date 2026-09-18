import { createNeonDb } from './client.js';
import { SCHEMA_STATEMENTS } from './schema.js';

/** 幂等建表（IF NOT EXISTS）。用法：DATABASE_URL=... npx tsx server/db/migrate.ts */
export async function migrate(connectionString: string): Promise<void> {
  const db = createNeonDb(connectionString);
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.query(stmt);
  }
  console.log(`[migrate] schema applied (${SCHEMA_STATEMENTS.length} statements)`);
}

// 直接运行时执行
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  migrate(url).catch((e) => {
    console.error('[migrate] failed:', e);
    process.exit(1);
  });
}

import { createNeonDb } from './client.js';
import { SCHEMA_STATEMENTS } from './schema.js';

/**
 * 幂等 schema 演进：CREATE TABLE IF NOT EXISTS 不会改已存在表的约束/补列。
 * P5 放宽 approvals.gate CHECK（加 spec/requirement），已建库需显式更新约束。
 * 修改1B：messages 表新增 reply_to 列（nullable，驳回反馈指向被驳回消息 id）。
 * DROP IF EXISTS + ADD 包在**同一事务**里（review C6），避免 DROP 成功但 ADD 失败留下无约束窗口。
 * neon serverless 不支持多语句 prepared statement，故用显式 BEGIN/COMMIT 包裹逐条执行。
 */
const MIGRATION_STATEMENTS: string[] = [
  `BEGIN`,
  `ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_gate_check`,
  `ALTER TABLE approvals ADD CONSTRAINT approvals_gate_check
     CHECK (gate IN ('requirement','spec','architecture','code'))`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to text`,
  `COMMIT`,
];

/** 幂等建表 + 约束演进。用法：DATABASE_URL=... npx tsx server/db/migrate.ts */
export async function migrate(connectionString: string): Promise<void> {
  const db = createNeonDb(connectionString);
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.query(stmt);
  }
  try {
    for (const stmt of MIGRATION_STATEMENTS) {
      await db.query(stmt);
    }
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  }
  console.log(`[migrate] schema applied (${SCHEMA_STATEMENTS.length} create + constraint migrate)`);
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

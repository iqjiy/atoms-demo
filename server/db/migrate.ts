import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNeonDb } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 执行 schema.sql 建表。用法：DATABASE_URL=... npx tsx server/db/migrate.ts */
export async function migrate(connectionString: string): Promise<void> {
  const db = createNeonDb(connectionString);
  const ddl = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // neon serverless 的 prepared statement 不支持多语句，按分号拆成单条逐句执行
  const statements = ddl
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.query(stmt);
  }
  console.log(`[migrate] schema applied (${statements.length} statements)`);
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

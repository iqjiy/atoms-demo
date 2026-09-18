import { neon } from '@neondatabase/serverless';
import type { Db } from './db.js';

/** 生产 Neon 连接：基于 DATABASE_URL，返回符合 Db 接口的 query 封装。 */
export function createNeonDb(connectionString: string): Db {
  const sql = neon(connectionString);
  return {
    async query<T = unknown>(text: string, params: unknown[] = []) {
      const rows = (await sql.query(text, params)) as T[];
      return { rows };
    },
  };
}

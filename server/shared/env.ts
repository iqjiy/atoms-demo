/** 环境变量读取与校验。 */
export const env = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  /** Neon Postgres 连接串；未配置时回退内存实现（仅开发/测试）。 */
  databaseUrl: process.env.DATABASE_URL ?? '',
};

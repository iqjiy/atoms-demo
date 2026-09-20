/** 环境变量读取与校验。 */
export const env = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  /** Neon Postgres 连接串；未配置时回退内存实现（仅开发/测试）。 */
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** 访问口令：设置后所有 /api/*（除 /health）需先 /api/auth 换 cookie。空 = 关闭口令（本地开发不被打断）。 */
  accessKey: process.env.ACCESS_KEY ?? '',
  /** IP 级每分钟请求数上限（挡脚本刷接口）。 */
  rateLimitRpm: Number(process.env.RATE_LIMIT_RPM ?? 20),
  /** 全局每日 run 数保险丝：锁死当日总费用。 */
  maxGlobalRunsPerDay: Number(process.env.MAX_GLOBAL_RUNS_PER_DAY ?? 50),
};

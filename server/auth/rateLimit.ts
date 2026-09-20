import type { Request, Response, NextFunction } from 'express';

interface Bucket { count: number; resetAt: number }

/**
 * 固定窗口限流（进程内 Map，单实例足够，无需 Redis）。
 * 进程重启计数清零——demo 可接受的 trade-off，见 task/api_SECURITY/plan.md §7。
 */
export function createRateLimiter() {
  const buckets = new Map<string, Bucket>();

  /** 固定窗口计数：返回 true 放行，false 超限。 */
  function hit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (b.count >= limit) return false;
    b.count++;
    return true;
  }

  /** IP 级每分钟请求数闸门：挡脚本刷接口。 */
  function ipRateLimit(rpm: number) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (hit(`ip:${req.ip}`, rpm, 60_000)) { next(); return; }
      res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    };
  }

  /** 全局每日 run 数保险丝：超过直接拒，锁死当日总费用。 */
  function globalRunLimit(maxPerDay: number) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (hit('global:runs', maxPerDay, 24 * 3600_000)) { next(); return; }
      res.status(429).json({ error: '今日演示次数已达上限，请明天再来' });
    };
  }

  return { hit, ipRateLimit, globalRunLimit };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, randomBytes } from 'node:crypto';

export const ACCESS_COOKIE = 'atoms_access';

/** 用 timingSafeEqual 防止时序侧信道比对口令。 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 签发一个难猜的 cookie 值（不是口令本身，避免口令出现在客户端）。 */
export function issueAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 校验中间件：cookie 命中已签发 token 集合才放行；否则 401。 */
export function accessGate(opts: { validTokens: Set<string> }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tok = req.cookies?.[ACCESS_COOKIE];
    if (tok && opts.validTokens.has(tok)) { next(); return; }
    res.status(401).json({ error: 'access key required' });
  };
}

/** 登录处理器：比对口令，成功则签发 token 并写 HttpOnly cookie。 */
export function makeLoginHandler(opts: { accessKey: string; validTokens: Set<string> }) {
  return (req: Request, res: Response): void => {
    const key = String((req.body as { key?: string })?.key ?? '');
    if (!safeEqual(key, opts.accessKey)) {
      res.status(401).json({ error: 'wrong access key' });
      return;
    }
    const token = issueAccessToken();
    opts.validTokens.add(token);
    res.cookie(ACCESS_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production', // Render 是 https
      maxAge: 24 * 3600 * 1000,
    });
    res.json({ ok: true });
  };
}

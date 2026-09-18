import { randomUUID } from 'node:crypto';

export const OWNER_COOKIE = 'ownerId';

export interface OwnerCookieOptions {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
}

export interface ResolvedOwner {
  ownerId: string;
  /** true 表示本次新签发，需要写 Set-Cookie */
  isNew: boolean;
  cookie: OwnerCookieOptions;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COOKIE_OPTIONS: OwnerCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
};

/**
 * 解析匿名身份：已有合法 ownerId Cookie 则复用，否则新签发一个 uuid。
 * 不写响应——由 Express 中间件根据 isNew 决定是否 Set-Cookie。
 */
export function resolveOwner(existingCookie: string | undefined): ResolvedOwner {
  if (existingCookie && UUID_RE.test(existingCookie)) {
    return { ownerId: existingCookie, isNew: false, cookie: COOKIE_OPTIONS };
  }
  return { ownerId: randomUUID(), isNew: true, cookie: COOKIE_OPTIONS };
}

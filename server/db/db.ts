/** 数据库访问抽象：Repository 只依赖此接口，生产注入 Neon、单测注入内存 Fake。 */
export interface Db {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

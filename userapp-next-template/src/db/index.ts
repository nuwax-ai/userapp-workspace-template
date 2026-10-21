import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { buildConnectionString } from './connection';

/**
 * 数据库连接（Drizzle ORM + node-postgres）—— 全应用唯一 DB 入口。
 *
 * 连接串优先用 DATABASE_URL；否则从 POSTGRES_* + PGHOST/PGPORT 拼接
 * （默认值对齐 app-runtime-base 容器内 PG：localhost:5432, user/db=app）。
 *
 * server 端使用（Server Components / Server Actions / API routes），不暴露浏览器。
 */
export const pool = new Pool({
  connectionString: buildConnectionString(),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 异步错误（如服务端关闭连接）必须有监听器，否则 Node 进程会抛 unhandled error。
pool.on('error', (err) => {
  console.error('[db] PG pool idle error:', err.message);
});

// 优雅关闭：进程退出前关闭连接池（避免 hot reload / 容器重启时连接堆积）。
process.on('beforeExit', () => {
  void pool.end().catch(() => {});
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;

/**
 * PG 连接串构建 —— 全应用唯一出处（db client / migrate / seed 共用）。
 *
 * DATABASE_URL 优先；否则从 POSTGRES_* + PGHOST/PGPORT 拼接
 * （默认值对齐 app-runtime-base 容器内 PG：localhost:5432, user/password/db=dev）。
 *
 * user/password/database 经 encodeURIComponent，兼容含特殊字符的密码
 * （如含 @ : / —— 否则会破坏 `postgresql://user:pass@host` 的 URL 解析）。
 */
export function buildConnectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = encodeURIComponent(process.env.POSTGRES_USER || 'dev');
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'dev');
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || '5432';
  const database = encodeURIComponent(process.env.POSTGRES_DB || 'dev');
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

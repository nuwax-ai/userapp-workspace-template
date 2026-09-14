import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit 配置 —— 供 `db:generate` / `db:push` / `db:studio` 使用。
 *
 * 连接串：优先 DATABASE_URL，否则从 POSTGRES_* + PGHOST/PGPORT 拼接（对齐 db/index.ts）。
 */
const url =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'dev'}:${process.env.POSTGRES_PASSWORD || 'dev'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.POSTGRES_DB || 'dev'}`;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});

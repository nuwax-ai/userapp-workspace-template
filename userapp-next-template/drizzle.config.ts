import { defineConfig } from 'drizzle-kit';
import { buildConnectionString } from './src/db/connection';

/**
 * Drizzle Kit 配置 —— 供 `db:generate` / `db:push` / `db:studio` 使用。
 *
 * 连接串：优先 DATABASE_URL，否则从 POSTGRES_* + PGHOST/PGPORT 拼接（对齐 db/index.ts）。
 */
const url = buildConnectionString();

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});

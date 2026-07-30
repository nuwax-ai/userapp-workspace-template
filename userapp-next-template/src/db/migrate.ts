import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { buildConnectionString } from './connection';

/**
 * 运行时迁移 —— 平台（app-cli）等 PG 就绪后执行 manifest 的 run.migrate
 * （`node migrate.js`，本文件经 esbuild 打包成自包含 cjs），随后才启动 `node server.js`。
 *
 * 用 drizzle-orm 运行时 migrator 读 drizzle/ 目录顺序执行，**不依赖 drizzle-kit**（devDep）。
 * 幂等由 `__drizzle_migrations` journal 保证；平台不做 down migration。
 */
async function main() {
  const pool = new Pool({ connectionString: buildConnectionString(), max: 1 });
  const db = drizzle(pool);

  console.log('[migrate] applying migrations from ./drizzle ...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('[migrate] done');

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});

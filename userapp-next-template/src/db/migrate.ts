import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { buildConnectionString } from './connection';

/**
 * 运行时迁移 —— start.sh 在启动 Next.js 前调用（`tsx src/db/migrate.ts`）。
 *
 * 用 drizzle-orm 运行时 migrator 读 drizzle/ 目录顺序执行，**不依赖 drizzle-kit**（devDep）。
 * 这让生产容器只需 drizzle-orm（运行时依赖）即可迁移。
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

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from './schema';
import { buildConnectionString } from './connection';

/**
 * Seed 示例数据 —— `npm run db:seed`。
 *
 * 幂等：先清空 users 再插示例行。便于本地/演示快速看到数据。
 */
async function main() {
  const pool = new Pool({ connectionString: buildConnectionString(), max: 1 });
  const db = drizzle(pool, { schema: { users } });

  console.log('[seed] resetting users and inserting samples ...');
  await db.delete(users);
  await db.insert(users).values([
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
    { name: 'Charlie', email: 'charlie@example.com' },
  ]);
  console.log('[seed] done');

  await pool.end();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});

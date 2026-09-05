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
 *
 * 并发防护：drizzle migrator 的 journal 表 DDL 在迁移事务**外**自动提交，迁移事务内
 * 的 CREATE TABLE IF NOT EXISTS 同样非原子——与其他服务并发首启（或另一 drizzle
 * 服务）会撞系统目录唯一键（SQLSTATE 23505）。故独占唯一连接取**会话级**咨询锁
 * （key=424242，与 go/java/python/rust 后端共用同一把，勿改），包住"journal DDL +
 * 迁移事务"整体；锁随连接关闭释放（pool.end / 进程退出），无残留。
 */
const SCHEMA_INIT_LOCK_KEY = 424242;

async function main() {
  const pool = new Pool({ connectionString: buildConnectionString(), max: 1 });
  try {
    // 独占唯一连接：会话级咨询锁与 migrate 同连接，包住"journal 表 DDL（事务外）+
    // 迁移事务"整体。锁随连接关闭释放（pool.end / 进程退出），无残留。
    const client = await pool.connect();
    try {
      const db = drizzle(client); // Pool | Client 均可；Client 形态下事务复用本连接
      await client.query(`SELECT pg_advisory_lock(${SCHEMA_INIT_LOCK_KEY})`);

      console.log('[migrate] applying migrations from ./drizzle ...');
      await migrate(db, { migrationsFolder: './drizzle' });
      console.log('[migrate] done');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});

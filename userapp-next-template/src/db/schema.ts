import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

/**
 * 数据库 schema 权威源 —— 模板所有表在此定义。
 *
 * 改完跑：
 *   npm run db:generate   # 生成迁移 SQL 到 drizzle/
 *   npm run db:migrate    # 应用迁移到 DB
 *
 * 加新表：在此 `pgTable(...)` 后追加 export 即可。
 */

/** users —— 示例表，演示 CRUD（列表/新增/编辑/删除）。 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** 推断类型 —— 业务代码用，避免手写 interface 与 schema 漂移。 */
export type User = typeof users.$inferSelect; // 查询结果行
export type NewUser = typeof users.$inferInsert; // 插入行

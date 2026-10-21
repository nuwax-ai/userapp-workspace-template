import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import AddUserForm from '@/components/AddUserForm';
import UserTable from '@/components/UserTable';

export const dynamic = 'force-dynamic';

/**
 * 用户管理 Demo —— async Server Component 直接读数据库（App Router 推荐范式）。
 * 数据在服务端取回后渲染，无需客户端 fetch；写操作走 Server Actions（见 ./actions.ts）。
 */
export default async function UsersPage() {
  const rows = await db.select().from(users).orderBy(desc(users.id)).limit(100);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/" className="text-blue-500 hover:underline text-sm">← 返回首页</Link>
        <h1 className="text-2xl font-bold mt-2">用户管理 Demo</h1>
        <p className="text-gray-500 mt-1">
          Server Component 直读 PostgreSQL（容器内 <code className="bg-gray-100 px-1 rounded">localhost:5432</code>），写操作用 Server Actions。Drizzle ORM 示例。
        </p>
      </div>
      <AddUserForm />
      <UserTable users={rows} />
    </div>
  );
}

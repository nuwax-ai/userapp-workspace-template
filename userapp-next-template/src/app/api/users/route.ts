import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';

export const dynamic = 'force-dynamic';

/** GET /api/users — 用户列表（RESTful 程序化访问；页面渲染走 Server Component 直读）。 */
export async function GET() {
  try {
    const rows = await db.select().from(users).orderBy(desc(users.id)).limit(100);
    return NextResponse.json({ data: rows });
  } catch (e) {
    // 日志记录原始错误便于排查；响应不回显 detail（脱敏，避免泄露 schema/连接信息）
    console.error('[api/users] GET failed:', e);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
}

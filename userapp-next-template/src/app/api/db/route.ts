import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

/** GET /api/db — 数据库连接状态 + 表列表（诊断用）。 */
export async function GET() {
  const host = process.env.PGHOST || 'localhost';
  const database = process.env.POSTGRES_DB || 'app';
  const user = process.env.POSTGRES_USER || 'app';
  try {
    const versionRes = await db.execute(sql`SELECT version()`);
    const tablesRes = await db.execute(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    return NextResponse.json({
      connected: true,
      version: (versionRes.rows[0] as { version: string }).version,
      tables: (tablesRes.rows as { tablename: string }[]).map((t) => t.tablename),
      host,
      database,
      user,
    });
  } catch (e) {
    console.error('[api/db] failed:', e);
    return NextResponse.json(
      { connected: false, error: 'database query failed', host, database },
      { status: 500 }
    );
  }
}

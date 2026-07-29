import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

/** GET /api/health — 健康检查（含 DB ping）。供 RCoder readiness 探测 / 排查用。 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    console.error('[api/health] DB ping failed:', e);
    return NextResponse.json({ status: 'degraded', db: 'unreachable' }, { status: 503 });
  }
}

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { updateUserSchema, isUniqueViolation } from '@/db/validation';

export const dynamic = 'force-dynamic';

/** DELETE /api/users/:id — 删除（RESTful，按 path 参数）。 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!numId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    await db.delete(users).where(eq(users.id, numId));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[api/users] DELETE failed:', e);
    return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  }
}

/** PUT /api/users/:id — 更新（RESTful）。body: { name, email } */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = Number(id);
    const body = await req.json();
    const parsed = updateUserSchema.safeParse({ id: numId, ...body });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
    }
    await db
      .update(users)
      .set({ name: parsed.data.name, email: parsed.data.email })
      .where(eq(users.id, parsed.data.id));
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: '该邮箱已存在' }, { status: 409 });
    }
    console.error('[api/users] PUT failed:', e);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { insertUserSchema, updateUserSchema, isUniqueViolation } from '@/db/validation';

/**
 * Server Actions —— 表单 mutation（Next.js App Router 推荐范式）。
 *
 * 设计：
 * - 输入经 zod 校验（insertUserSchema / updateUserSchema），脏数据返回 422 友好错误，不落 DB。
 * - DB 错误分类：unique 冲突（email 重复）→ 友好提示；其他 → 通用错误 + 服务端日志（脱敏）。
 * - createUser 用 useActionState 签名（prevState, formData）→ 行内错误反馈（不整页 error）。
 *   updateUser/deleteUser 用 form action 签名；失败 throw 友好 Error，由 error.tsx 接住（整页兜底）。
 */

export type ActionState = { error: string | null };

/** 新建用户 —— useActionState（行内错误反馈） */
export async function createUser(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = insertUserSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  try {
    await db.insert(users).values(parsed.data);
    revalidatePath('/users');
    return { error: null };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: '该邮箱已存在' };
    console.error('[createUser] failed:', e);
    return { error: '创建失败，请稍后重试' };
  }
}

/** 更新用户 —— form action（失败 throw 友好 Error，error.tsx 接住） */
export async function updateUser(formData: FormData) {
  const parsed = updateUserSchema.safeParse({
    id: Number(formData.get('id')),
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }
  try {
    await db
      .update(users)
      .set({ name: parsed.data.name, email: parsed.data.email })
      .where(eq(users.id, parsed.data.id));
    revalidatePath('/users');
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error('该邮箱已存在');
    console.error('[updateUser] failed:', e);
    throw new Error('更新失败，请稍后重试');
  }
}

/** 删除用户 —— form action */
export async function deleteUser(formData: FormData) {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('无效 id');
  }
  try {
    await db.delete(users).where(eq(users.id, id));
    revalidatePath('/users');
  } catch (e) {
    console.error('[deleteUser] failed:', e);
    throw new Error('删除失败，请稍后重试');
  }
}

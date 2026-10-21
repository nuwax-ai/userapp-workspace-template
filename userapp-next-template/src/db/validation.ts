import { z } from 'zod';

/**
 * 输入校验 schema（zod）—— Server Actions / REST API 共用。
 *
 * 与 drizzle schema（schema.ts）的约束对齐：name ≤ 100，email ≤ 200 且 unique。
 * 校验在应用层做（422 友好错误），避免脏数据落到 DB 触发 500。
 */

export const insertUserSchema = z.object({
  name: z
    .string({ required_error: '姓名不能为空' })
    .trim()
    .min(1, '姓名不能为空')
    .max(100, '姓名最多 100 字符'),
  email: z
    .string({ required_error: '邮箱不能为空' })
    .trim()
    .min(1, '邮箱不能为空')
    .email('邮箱格式不正确')
    .max(200, '邮箱最多 200 字符'),
});

export const updateUserSchema = z.object({
  id: z.number().int().positive('无效 id'),
  name: insertUserSchema.shape.name,
  email: insertUserSchema.shape.email,
});

/** 从 pg/drizzle 错误中识别"唯一约束冲突"(email 重复)→ 转友好提示 */
export function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  // pg unique 违反 code 23505;message 含 "unique"/"duplicate key"
  return msg.includes('23505') || msg.includes('unique') || msg.includes('duplicate');
}

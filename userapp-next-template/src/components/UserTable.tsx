'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { deleteUser, updateUser } from '@/app/users/actions';
import type { User } from '@/db/schema';

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="text-red-500 hover:text-red-700 text-sm disabled:opacity-50">
      {pending ? '删除中...' : '删除'}
    </button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="text-blue-500 hover:text-blue-700 text-sm disabled:opacity-50">
      {pending ? '保存中...' : '保存'}
    </button>
  );
}

/**
 * 用户表格 —— 接收 Server Component 传入的 users（不再客户端 fetch）。
 * 编辑/删除用 Server Action；inline 编辑用 HTML form 关联（input 的 form 属性）。
 */
export default function UserTable({ users }: { users: User[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">姓名</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">邮箱</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {users.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                暂无数据（点击上方表单添加用户，或运行 <code className="bg-gray-100 px-1 rounded">npm run db:seed</code>）
              </td>
            </tr>
          ) : (
            users.map((u) =>
              editingId === u.id ? (
                <tr key={u.id} className="bg-blue-50">
                  <td className="px-4 py-2 text-sm text-gray-500">{u.id}</td>
                  <td className="px-4 py-2">
                    <input
                      name="name"
                      defaultValue={u.name}
                      form={`edit-${u.id}`}
                      required
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      name="email"
                      type="email"
                      defaultValue={u.email}
                      form={`edit-${u.id}`}
                      required
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                    />
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-400">—</td>
                  <td className="px-4 py-2 flex gap-2">
                    <form id={`edit-${u.id}`} action={updateUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <SaveButton />
                    </form>
                    <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 text-sm">
                      取消
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-500">{u.id}</td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{u.email}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {new Date(u.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-2 flex gap-2">
                    <button onClick={() => setEditingId(u.id)} className="text-blue-500 hover:text-blue-700 text-sm">
                      编辑
                    </button>
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <DeleteButton />
                    </form>
                  </td>
                </tr>
              )
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createUser } from '@/app/users/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-blue-500 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-600 disabled:opacity-50 transition"
    >
      {pending ? '提交中...' : '+ 添加用户'}
    </button>
  );
}

/**
 * 添加用户表单 —— useActionState 绑定 Server Action，行内显示校验/业务错误
 * （如"邮箱格式不正确"/"该邮箱已存在"），不触发整页 error boundary。
 */
export default function AddUserForm() {
  const [state, formAction] = useActionState(createUser, { error: null });

  return (
    <form action={formAction} className="flex flex-wrap gap-3 items-end mb-6">
      <div className="flex flex-col">
        <label className="block text-xs text-gray-500 mb-1">姓名</label>
        <input
          name="name"
          required
          maxLength={100}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="张三"
        />
      </div>
      <div className="flex flex-col">
        <label className="block text-xs text-gray-500 mb-1">邮箱</label>
        <input
          name="email"
          type="email"
          required
          maxLength={200}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="zhangsan@example.com"
        />
      </div>
      <SubmitButton />
      {state.error && <span className="text-red-500 text-sm">⚠️ {state.error}</span>}
    </form>
  );
}

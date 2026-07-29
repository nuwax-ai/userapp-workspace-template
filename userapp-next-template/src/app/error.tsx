'use client';

import { useEffect } from 'react';

/**
 * 错误边界（App Router 约定文件，必须是 client component）。
 * 捕获 Server Component / Server Action 抛出的错误；生产环境原始错误不会泄露给客户端。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error boundary]', error);
  }, [error]);

  return (
    <main className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-red-500">⚠️ 出错了</h1>
      <p className="text-gray-500 text-sm">
        {error.message || '发生未知错误'}
        <br />
        <span className="text-gray-400">
          （常见原因：数据库未就绪 / 查询失败。检查 <code>/api/db</code>）
        </span>
      </p>
      <button
        onClick={reset}
        className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600"
      >
        重试
      </button>
    </main>
  );
}

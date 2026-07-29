import Link from 'next/link';

/** 404 页面（App Router 约定文件）。 */
export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-gray-300">404</h1>
      <p className="text-gray-500">页面不存在</p>
      <Link href="/" className="text-blue-500 hover:underline">← 返回首页</Link>
    </main>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* 导航栏 */}
      <nav className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
          <span className="font-bold text-lg">🚀 UserApp Next.js 模板</span>
          <div className="flex gap-4 text-sm">
            <Link href="/users" className="text-blue-500 hover:underline">用户管理</Link>
            {/* /api/* 是 API 端点（返回 JSON），用 <a> 硬导航；next/link 仅用于页面路由 */}
            <a href="/api/db" className="text-gray-500 hover:underline">DB 状态</a>
            <a href="/api/health" className="text-gray-500 hover:underline">Health</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto text-center py-16 px-6">
        <h1 className="text-4xl font-bold mb-4">前端 + 数据库 一体化模板</h1>
        <p className="text-gray-500 text-lg mb-8">
          Next.js 16 + Drizzle ORM + PostgreSQL，开箱即用的 UserApp 模板项目
        </p>
        <Link
          href="/users"
          className="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition"
        >
          开始体验 →
        </Link>
      </div>

      {/* 功能卡片 */}
      <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6 px-6 pb-16">
        <Link href="/users" className="border rounded-lg p-6 hover:shadow-lg transition bg-white">
          <div className="text-3xl mb-3">👥</div>
          <h3 className="font-semibold mb-2">用户管理 Demo</h3>
          <p className="text-sm text-gray-500">
            Server Component 直读 DB + Server Actions 写操作。Drizzle ORM，含迁移与 seed。
          </p>
        </Link>
        <a href="/api/db" className="border rounded-lg p-6 hover:shadow-lg transition bg-white">
          <div className="text-3xl mb-3">🗄️</div>
          <h3 className="font-semibold mb-2">数据库状态</h3>
          <p className="text-sm text-gray-500">查看 PG 连接状态、版本、表列表（JSON）。</p>
        </a>
        <div className="border rounded-lg p-6 bg-white">
          <div className="text-3xl mb-3">📦</div>
          <h3 className="font-semibold mb-2">技术栈</h3>
          <p className="text-sm text-gray-500">
            Next.js 16 + React 19 + Drizzle ORM + Tailwind 4 + PostgreSQL
          </p>
        </div>
      </div>

      {/* 底部 */}
      <footer className="border-t bg-white py-6 text-center text-sm text-gray-400">
        UserApp Next.js Template — 在 RCoder 应用管理平台上运行
      </footer>
    </main>
  );
}

/** 加载态（App Router 约定文件）—— Server Component 取数时显示。 */
export default function Loading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-gray-400 animate-pulse">加载中...</p>
    </div>
  );
}

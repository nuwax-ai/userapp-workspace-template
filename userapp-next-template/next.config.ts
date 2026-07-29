import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产部署用 standalone：`npm run build` 产出自包含 .next/standalone/，
  // 容器直接 `node server.js` 启动（秒级），不需 npm install + build。
  // 本地开发 `npm run dev` 不受影响。
  output: "standalone",
  images: {
    // 跳过 sharp（next 图片优化的 native 模块），让 standalone 产物跨架构可移植
    // （本地 mac arm64 build 的产物能在 amd64 容器跑）。模板不做图片优化。
    unoptimized: true,
  },
};

export default nextConfig;

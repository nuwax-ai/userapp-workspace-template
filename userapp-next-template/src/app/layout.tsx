import type { Metadata } from "next";
// 字体随 geist npm 包内置（next/font/local 封装），构建期零外网——
// 勿改回 next/font/google：构建时要从 Google Fonts 拉字体，国内/受限沙箱必挂。
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "UserApp Next.js 模板",
  description: "Next.js 16 + Drizzle ORM + PostgreSQL 一体化 UserApp 模板（运行于 RCoder）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

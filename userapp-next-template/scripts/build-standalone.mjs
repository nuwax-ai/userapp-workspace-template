#!/usr/bin/env node
/**
 * 打包 standalone 产物（本地/CI build，跨平台 node 脚本）。
 *
 * 产物：userapp-next-standalone.zip，解压后含：
 *   server.js + 最小 node_modules   ← Next.js standalone（自包含）
 *   .next/static / public            ← 静态资源（standalone 不自动含，手动拷）
 *   migrate.js                       ← drizzle 迁移（esbuild bundle，自包含 drizzle-orm）
 *   drizzle/                         ← 迁移 SQL
 *
 * 跨平台：node fs.cpSync + 标准库 Python 3.11+（不依赖 cp/zip CLI）。
 * 保留 traced standalone 边界，默认追加非源码/缓存/私有运行资源与 scripts/。
 * 对应 project.manifest.toml 的 [build].command：file-server 跑此命令产 [build].artifact。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { installLocked } from './install-locked.mjs';

const ROOT = process.cwd();
const STANDALONE = join(ROOT, '.next/standalone');
const log = (m) => console.log(m);

async function main() {
  // Respect packageManager or the single existing lock. When both locks are
  // absent, preserve the documented first-build initialization and log its lock.
  log('📦 [0/6] locked dependency install...');
  const manager = installLocked(ROOT);

  // esbuild 依赖锁定安装的产物——静态 import 会在安装前解析即失败，
  // 须在安装完成后动态加载
  const { build: esbuild } = await import('esbuild');

  log('📦 [1/6] next build (output: standalone)...');
  // next build 要求 production 环境：宿主链路（execute-command/构建通道）注入的
  // NODE_ENV=development 会让 Turbopack prerender 崩（useContext null）——此处
  // 显式钉 production；npm ci 不受影响（devDependencies 正常安装）
  execFileSync(manager, ['run', 'build'], {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
  });

  log('📦 [2/5] esbuild bundle migrate.js（自包含 drizzle-orm/pg，cjs）...');
  await esbuild({
    entryPoints: [join(ROOT, 'src/db/migrate.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(STANDALONE, 'migrate.js'),
    logLevel: 'warning',
  });

  log('📦 [3/5] 拷静态资源（standalone 不自动含）...');
  cpSync(join(ROOT, '.next/static'), join(STANDALONE, '.next/static'), { recursive: true });
  if (existsSync(join(ROOT, 'public'))) {
    cpSync(join(ROOT, 'public'), join(STANDALONE, 'public'), { recursive: true });
  }

  log('📦 [4/5] 拷 drizzle 迁移...');
  cpSync(join(ROOT, 'drizzle'), join(STANDALONE, 'drizzle'), { recursive: true });

  log('📦 [5/5] 验证 standalone + 运行资源，原子生成 zip...');
  execFileSync('python3', [
    join(ROOT, 'scripts/artifact_pack.py'), '--mode', 'standalone',
    '--layout-root', '.next/standalone', '--artifact', 'userapp-next-standalone.zip',
    '--required', 'server.js', '--required', 'migrate.js',
  ], { stdio: 'inherit', cwd: ROOT });

  log(`✅ standalone 产物: userapp-next-standalone.zip`);
  log('   部署: 上传到 RCoder app 的 code/；平台以 run.command=["node","server.js"] 启动');
}

main().catch((err) => {
  console.error('❌ build-standalone failed:', err);
  process.exit(1);
});

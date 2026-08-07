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
 * 跨平台：用 node fs.cpSync + archiver（不依赖 cp/zip CLI，mac/linux/windows 都能跑）。
 * 对应 project.manifest.toml 的 [build].command：file-server 跑此命令产 [build].artifact。
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, createWriteStream, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import archiver from 'archiver';

const ROOT = process.cwd();
const STANDALONE = join(ROOT, '.next/standalone');
const ZIP = join(ROOT, 'userapp-next-standalone.zip');
const log = (m) => console.log(m);

async function main() {
  log('📦 [0/6] npm ci（消费 package-lock.json 可重现安装）...');
  execSync('npm ci', { stdio: 'inherit', cwd: ROOT });

  log('📦 [1/6] next build (output: standalone)...');
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT });

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

  log('📦 [5/5] archiver 打 zip...');
  rmSync(ZIP, { force: true });
  await new Promise((resolve, reject) => {
    const out = createWriteStream(ZIP);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    archive.on('error', reject);
    out.on('error', reject);
    archive.pipe(out);
    archive.directory(STANDALONE, false); // false: zip 根直接是 server.js（无顶层目录）
    archive.finalize();
  });

  log(`✅ standalone 产物: userapp-next-standalone.zip`);
  log('   部署: 上传到 RCoder app 的 code/；平台以 run.command=["node","server.js"] 启动');
}

main().catch((err) => {
  console.error('❌ build-standalone failed:', err);
  process.exit(1);
});

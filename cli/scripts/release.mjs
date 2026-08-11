#!/usr/bin/env node
/**
 * release.mjs —— 版本发布辅助工具。
 *
 * 用法:
 *   node scripts/release.mjs beta              # 发测试版:自动 bump beta 版本号 + 打 tag
 *   node scripts/release.mjs release           # 发正式版:去掉 prerelease 后缀 + 打 tag
 *   node scripts/release.mjs beta --dry-run    # 预览会做什么,不执行
 *
 * 版本号规则:
 *   beta:    在当前版本上递增 beta 号(0.1.0 → 0.1.0-beta.1 → 0.1.0-beta.2)
 *   release: 去掉 prerelease 后缀(0.1.0-beta.2 → 0.1.0)
 *
 * 流程:
 *   1. 解析当前 package.json 版本
 *   2. 计算新版本号
 *   3. 写入 package.json
 *   4. git commit + git tag
 *   5. 提示你 git push --tags 触发 CI
 *
 * 注意:本脚本只做本地操作(改版本 + 打 tag),不直接发布。
 * 推送 tag 后由 GitHub Actions 自动发布到 npm。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.resolve(__dirname, '..', 'package.json');
const CLI_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const type = args[0];
const dryRun = args.includes('--dry-run') || args.includes('-n');

if (!type || !['beta', 'release'].includes(type)) {
  console.error('用法: node scripts/release.mjs <beta|release> [--dry-run]');
  console.error('  beta    发测试版(递增 beta 号)');
  console.error('  release 发正式版(去掉 prerelease 后缀)');
  process.exit(1);
}

// ── 读取当前版本 ──────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
const current = pkg.version;

// ── 计算新版本号 ──────────────────────────────────────────
let nextVersion;
let label;

if (type === 'beta') {
  // 0.1.0         → 0.1.0-beta.1
  // 0.1.0-beta.1  → 0.1.0-beta.2
  const m = current.match(/^(\d+\.\d+\.\d+)(?:-beta\.(\d+))?$/);
  if (!m) {
    console.error(`✗ 无法解析当前版本: ${current}`);
    console.error('  期望格式: x.y.z 或 x.y.z-beta.N');
    process.exit(1);
  }
  const base = m[1];
  const betaNum = m[2] ? parseInt(m[2], 10) + 1 : 1;
  nextVersion = `${base}-beta.${betaNum}`;
  label = `🧪 测试版`;
} else {
  // release: 0.1.0-beta.2 → 0.1.0
  //          0.1.0        → 报错(已经是正式版)
  if (!current.includes('-')) {
    console.error(`✗ 当前版本 ${current} 已经是正式版,无需 release`);
    console.error('  如需升级版本号,请先用 npm version patch/minor/major');
    process.exit(1);
  }
  nextVersion = current.replace(/-.*$/, '');
  label = `🚀 正式版`;
}

// ── 计算 dist-tag ────────────────────────────────────────
const distTag = nextVersion.includes('-') ? 'beta' : 'latest';

console.log(`${label}`);
console.log(`  当前版本: ${current}`);
console.log(`  新版本号: ${nextVersion}`);
console.log(`  npm tag:  ${distTag}`);
console.log(`  git tag:  v${nextVersion}`);
console.log();

if (dryRun) {
  console.log('--dry-run 模式,不执行实际操作。');
  process.exit(0);
}

// ── 执行:写版本 + git ────────────────────────────────────
const REPO_ROOT = path.resolve(CLI_DIR, '..');

// 0. 预检:tag 是否已存在(在写文件之前检查,避免产生不一致的中间态)
try {
  execSync(`git rev-parse "v${nextVersion}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
  console.error(`✗ tag v${nextVersion} 已存在。`);
  console.error('  如果是想重发,请先 git tag -d v' + nextVersion + ' 删除后重试。');
  process.exit(1);
} catch {
  // tag 不存在才是正常,继续
}

// 1. 写入 package.json
pkg.version = nextVersion;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ package.json version → ${nextVersion}`);

// 2. git add + commit(commit 失败必须中止,否则 tag 会打到旧 HEAD)
try {
  execSync('git add cli/package.json', { stdio: 'inherit', cwd: REPO_ROOT });
  execSync(`git commit -m "release: cli v${nextVersion}"`, { stdio: 'inherit', cwd: REPO_ROOT });
  console.log(`✓ git commit`);
} catch (e) {
  console.error(`✗ git commit 失败,中止发布。`);
  console.error('  package.json 已改但未提交,请手动 git checkout cli/package.json 回滚。');
  process.exit(1);
}

// 3. 打 tag
try {
  execSync(`git tag v${nextVersion}`, { stdio: 'inherit', cwd: REPO_ROOT });
  console.log(`✓ git tag v${nextVersion}`);
} catch {
  console.error(`✗ git tag v${nextVersion} 失败。`);
  console.error('  package.json 已提交但未打 tag,请手动处理:');
  console.error(`    git tag v${nextVersion} && git push origin main --tags`);
  process.exit(1);
}

// 4. 提示推送
console.log();
console.log('✅ 本地准备完成!推送以触发 CI 发布:');
console.log();
console.log(`  git push origin main --tags`);
console.log();
console.log(`  → CI 将自动发布 @nuwax-ai/cli@${nextVersion} (dist-tag: ${distTag})`);

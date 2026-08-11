#!/usr/bin/env node
/**
 * test-local.mjs —— 本地 E2E 测试脚本。
 *
 * 和 CI workflow 里的 E2E 测试保持一致,让本地也能 npm test。
 *
 * 运行: npm test
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(__dirname, '..');
const CLI = `node "${path.join(CLI_DIR, 'dist', 'index.js')}"`;

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  ✅ ${name}`);
  passed++;
}
function fail(name, msg) {
  console.error(`  ❌ ${name}${msg ? ': ' + msg : ''}`);
  failed++;
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
}

function assert(condition, name, msg) {
  if (condition) ok(name);
  else fail(name, msg);
}

console.log('▶ E2E 测试\n');

// 前置检查:dist 存在
if (!fs.existsSync(path.join(CLI_DIR, 'dist', 'index.js'))) {
  console.error('✗ 请先 npm run build');
  process.exit(1);
}
// 前置检查:templates 存在
if (!fs.existsSync(path.join(CLI_DIR, 'templates'))) {
  console.error('✗ 请先 npm run pack');
  process.exit(1);
}

const WORKDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'userapp-test-'));

try {
  // === smoke test ===
  console.log('=== smoke test ===');
  run(`${CLI} list`);
  ok('list 命令');
  run(`${CLI} docs`);
  ok('docs 命令');

  // === init: go + react ===
  console.log('\n=== init: go + react ===');
  run(`${CLI} init "${path.join(WORKDIR, 'test-app')}" --backend go --frontend react`);
  const appDir = path.join(WORKDIR, 'test-app');

  assert(fs.existsSync(path.join(appDir, 'workspace.manifest.toml')), 'workspace.manifest.toml 存在');
  assert(fs.existsSync(path.join(appDir, 'backend-go', 'project.manifest.toml')), 'backend-go manifest 存在');
  assert(fs.existsSync(path.join(appDir, 'frontend-react-vite', 'project.manifest.toml')), 'react manifest 存在');

  const goManifest = fs.readFileSync(path.join(appDir, 'backend-go', 'project.manifest.toml'), 'utf-8');
  assert(goManifest.includes('service_id = "backend-go"'), 'backend-go service_id');
  assert(goManifest.includes('path = "/api/go/"'), 'backend-go proxy path');

  // === workspace manifest 注释 ===
  const wsManifest = fs.readFileSync(path.join(appDir, 'workspace.manifest.toml'), 'utf-8');
  assert(wsManifest.includes('[pingap]'), 'workspace manifest 含 pingap 注释');
  assert(wsManifest.includes('bridge_service'), 'workspace manifest 含 bridge_service 注释');

  // === AGENTS.md ===
  const agentsPath = path.join(appDir, 'AGENTS.md');
  assert(fs.existsSync(agentsPath), 'AGENTS.md 存在');
  const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
  assert(agentsContent.includes('npx skills add nuwax-ai/userapp-workspace-template'), 'AGENTS.md 含 skills 安装命令');

  // === add: rust with custom service_id ===
  console.log('\n=== add: rust custom service_id ===');
  run(`${CLI} add backend-rust --service-id my-rust-api --path /api/rust-v2/`, { cwd: appDir });
  const cargoPath = path.join(appDir, 'my-rust-api', 'Cargo.toml');
  const cargo = fs.readFileSync(cargoPath, 'utf-8');
  assert(cargo.includes('name = "my-rust-api"'), 'Cargo crate 名派生为 my-rust-api');

  // === add: worker ===
  console.log('\n=== add: worker ===');
  run(`${CLI} add backend-python --kind worker --service-id bg-worker`, { cwd: appDir });
  const workerManifest = fs.readFileSync(path.join(appDir, 'bg-worker', 'project.manifest.toml'), 'utf-8');
  assert(workerManifest.includes('kind = "worker"'), 'worker kind = worker');
  assert(!workerManifest.includes('[proxy]'), 'worker 无 [proxy] 段');

  // === 冲突检测 ===
  console.log('\n=== 冲突检测 ===');
  let conflictCaught = false;
  try {
    run(`${CLI} add backend-go`, { cwd: appDir, stdio: 'pipe' });
  } catch {
    conflictCaught = true;
  }
  assert(conflictCaught, '重复 service_id 被拒绝');

  // === init: next fullstack ===
  console.log('\n=== init: next fullstack ===');
  run(`${CLI} init "${path.join(WORKDIR, 'test-next')}" --next`);
  const nextManifest = fs.readFileSync(
    path.join(WORKDIR, 'test-next', 'userapp-next', 'project.manifest.toml'),
    'utf-8',
  );
  assert(nextManifest.includes('migrate'), 'next manifest 含 migrate');
  assert(nextManifest.includes('userapp-next-standalone.zip'), 'next artifact 占位符替换');

  // === --next + --backend 冲突 ===
  console.log('\n=== --next + --backend 冲突检测 ===');
  let nextConflict = false;
  try {
    run(`${CLI} init "${path.join(WORKDIR, 'bad')}" --next --backend go`, { stdio: 'pipe' });
  } catch {
    nextConflict = true;
  }
  assert(nextConflict, '--next + --backend 被拒绝');
} finally {
  fs.rmSync(WORKDIR, { recursive: true, force: true });
}

// === 结果 ===
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed}  失败: ${failed}`);
if (failed > 0) {
  console.error('❌ 有失败');
  process.exit(1);
} else {
  console.log('✅ 全部通过');
}

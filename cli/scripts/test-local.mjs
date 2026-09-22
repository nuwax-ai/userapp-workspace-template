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

  // react devbuild: 允许 lockfile 生成/更新(无 lockfile 时 frozen 直接 ERR_PNPM_NO_LOCKFILE),
  // 且 type-check 仍串在安装后(安装/检查失败不得被吞)
  const reactManifest = fs.readFileSync(path.join(appDir, 'frontend-react-vite', 'project.manifest.toml'), 'utf-8');
  assert(
    reactManifest.includes('pnpm install --no-frozen-lockfile && pnpm run type-check'),
    'react devbuild = install --no-frozen-lockfile && type-check',
  );
  assert(!reactManifest.includes('--frozen-lockfile'), 'react devbuild 不含裸 --frozen-lockfile');

  // build 脚本同语义(app-171 事故回归):平台导出链过滤 pnpm-lock.yaml,
  // 构建脚本不得强依赖 lockfile——裸 install 缺失自动生成
  const buildScriptAssert = (scriptPath, label) => {
    const script = fs.readFileSync(scriptPath, 'utf-8');
    assert(script.includes('pnpm install'), `${label} build 脚本含 pnpm install`);
    assert(!script.includes('--frozen-lockfile'), `${label} build 脚本不含 --frozen-lockfile`);
  };
  buildScriptAssert(
    path.resolve(CLI_DIR, '..', 'frontend-react-vite', 'scripts', 'build-standalone.sh'),
    'react 源',
  );
  buildScriptAssert(
    path.join(appDir, 'frontend-react-vite', 'scripts', 'build-standalone.sh'),
    'react 生成',
  );

  // === workspace manifest 注释 ===
  const wsManifest = fs.readFileSync(path.join(appDir, 'workspace.manifest.toml'), 'utf-8');
  assert(wsManifest.includes('[pingap]'), 'workspace manifest 含 pingap 注释');
  assert(wsManifest.includes('bridge_service'), 'workspace manifest 含 bridge_service 注释');

  // === AGENTS.md ===
  const agentsPath = path.join(appDir, 'AGENTS.md');
  assert(fs.existsSync(agentsPath), 'AGENTS.md 存在');
  const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
  assert(agentsContent.includes('npx skills add nuwax-ai/userapp-workspace-template'), 'AGENTS.md 含 skills 安装命令');
  assert(agentsContent.includes('| /api/go/ |'), 'AGENTS.md 结构表含服务路由列');
  assert(agentsContent.includes('template-cli list backend'), 'AGENTS.md 含模板发现命令');
  assert(agentsContent.includes('结构快照'), 'AGENTS.md 声明为结构快照(规范以 skills 为准)');
  assert(agentsContent.includes('0.0.0.0:$PORT'), 'AGENTS.md 含端口契约(manifest 契约保留)');
  assert(!agentsContent.includes('Go + React') && !agentsContent.includes('Python + React'), 'AGENTS.md 不含默认选型策略');

  // === CLAUDE.md + 根 database/(init 根产物) ===
  const claudePath = path.join(appDir, 'CLAUDE.md');
  assert(fs.existsSync(claudePath) && fs.readFileSync(claudePath, 'utf-8') === '@AGENTS.md\n', 'CLAUDE.md = @AGENTS.md 导入');
  const genDbReadme = path.join(appDir, 'database', 'README.md');
  assert(fs.existsSync(genDbReadme), '根 database/README.md 生成');
  const repoDbReadme = fs.readFileSync(path.resolve(CLI_DIR, '..', 'database', 'README.md'), 'utf-8');
  assert(
    fs.readFileSync(genDbReadme, 'utf-8') === repoDbReadme,
    '生成的 database/README.md 与仓库根逐字一致(防漂移)',
  );
  assert(repoDbReadme.includes('开发阶段不会自动执行'), 'database README 含开发阶段说明');

  // === add: rust with custom service_id ===
  console.log('\n=== add: rust custom service_id ===');
  run(`${CLI} add backend-rust --service-id my-rust-api --path /api/rust-v2/`, { cwd: appDir });
  const cargoPath = path.join(appDir, 'my-rust-api', 'Cargo.toml');
  const cargo = fs.readFileSync(cargoPath, 'utf-8');
  assert(cargo.includes('name = "my-rust-api"'), 'Cargo crate 名派生为 my-rust-api');
  assert(cargo.includes('"axum", "vendored"'), 'utoipa-swagger-ui 启用 vendored(构建期零外网)');

  // === init: react 自定义 service_id + path(pack 占位符注入 + VITE_BASE 派生回归) ===
  console.log('\n=== init: react custom service_id + path ===');
  const packedVite = fs.readFileSync(
    path.join(CLI_DIR, 'templates', 'frontend-react-vite', 'vite.config.ts'),
    'utf-8',
  );
  assert(packedVite.includes('__VITE_BASE__'), 'pack 注入 vite.config.ts 占位符');
  const packedClaude = fs.readFileSync(
    path.join(CLI_DIR, 'templates', 'frontend-react-vite', 'CLAUDE.md'),
    'utf-8',
  );
  assert(packedClaude === '@AGENTS.md\n', '前端模板 CLAUDE.md 归一为 @AGENTS.md(无内容副本)');

  run(`${CLI} init "${path.join(WORKDIR, 'test-web')}" --frontend react --service-id my-web --path /admin/`);
  const webDir = path.join(WORKDIR, 'test-web', 'my-web');
  const webVite = fs.readFileSync(path.join(webDir, 'vite.config.ts'), 'utf-8');
  assert(
    webVite.includes("base: command === 'serve' ? '/' : '/admin/',") && !webVite.includes('__VITE_BASE__'),
    'vite build base 派生为 /admin/',
  );

  const webManifest = fs.readFileSync(path.join(webDir, 'project.manifest.toml'), 'utf-8');
  assert(webManifest.includes('service_id = "my-web"'), 'manifest 自定义 service_id');
  assert(webManifest.includes('path = "/admin/"'), 'manifest 自定义 proxy path');
  assert(webManifest.includes('type = "static"'), 'static 形态 type = static');
  assert(!webManifest.includes('[run]'), 'static 无 [run] 段(平台内置静态托管)');

  // === add: worker ===
  console.log('\n=== add: worker ===');
  // 先删根 database/ 模拟旧版 CLI 产物,验证 add 兜底补齐
  fs.rmSync(path.join(appDir, 'database'), { recursive: true, force: true });
  run(`${CLI} add backend-python --kind worker --service-id bg-worker`, { cwd: appDir });
  const workerManifest = fs.readFileSync(path.join(appDir, 'bg-worker', 'project.manifest.toml'), 'utf-8');
  assert(workerManifest.includes('kind = "worker"'), 'worker kind = worker');
  assert(!workerManifest.includes('[proxy]'), 'worker 无 [proxy] 段');
  assert(fs.existsSync(path.join(appDir, 'database', 'README.md')), 'add 兜底补齐根 database/README.md');

  // === add: vue(add 入口的 devbuild 断言) ===
  console.log('\n=== add: vue devbuild ===');
  run(`${CLI} add frontend-vue3-vite`, { cwd: appDir });
  const vueManifest = fs.readFileSync(path.join(appDir, 'frontend-vue3-vite', 'project.manifest.toml'), 'utf-8');
  assert(vueManifest.includes('["pnpm", "install", "--no-frozen-lockfile"]'), 'vue devbuild = install --no-frozen-lockfile');
  assert(!vueManifest.includes('--frozen-lockfile'), 'vue devbuild 不含裸 --frozen-lockfile');
  buildScriptAssert(
    path.resolve(CLI_DIR, '..', 'frontend-vue3-vite', 'scripts', 'build-standalone.sh'),
    'vue 源',
  );
  buildScriptAssert(
    path.join(appDir, 'frontend-vue3-vite', 'scripts', 'build-standalone.sh'),
    'vue 生成',
  );

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
  const nextPkg = fs.readFileSync(
    path.join(WORKDIR, 'test-next', 'userapp-next', 'package.json'),
    'utf-8',
  );
  assert(nextPkg.includes('"geist"'), 'next 字体走 geist 包(构建期零外网)');

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

#!/usr/bin/env node
/**
 * test-local.mjs —— 本地 E2E 测试脚本。
 *
 * 本地、日常 CI 与发布 workflow 共用此入口,避免维护多份测试漂移。
 *
 * 运行: npm test
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { readImportGuide } from './pack-templates.mjs';

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
  // 测试 CLI 行为时跳过 registry 更新检查，避免网络结果/缓存影响输出或耗时。
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', env: { ...process.env, CI: '1' }, ...opts });
}

function assert(condition, name, msg) {
  if (condition) ok(name);
  else fail(name, msg);
}

function assertLocalLinks(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/```[\s\S]*?```/g, '');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split(/\s+/)[0].replace(/^<|>$/g, '');
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const relativePath = decodeURIComponent(target.split(/[?#]/)[0]);
    assert(fs.existsSync(path.resolve(path.dirname(filePath), relativePath)),
      `${path.relative(CLI_DIR, filePath)} 本地链接可达: ${target}`);
  }
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

  // === 导入已有项目：唯一正文、技能入口与打包错误 ===
  const skillsDir = path.resolve(CLI_DIR, '..', 'skills');
  const expectedSkills = ['userapp-dev-guide', 'userapp-scaffold'];
  const actualSkills = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name).sort();
  assert(actualSkills.join(',') === expectedSkills.join(','), '导入指引复用现有两个 skill，不新增第三个 skill');
  for (const skillName of expectedSkills) {
    assertLocalLinks(path.join(skillsDir, skillName, 'SKILL.md'));
  }
  const importGuidePath = path.join(skillsDir, 'userapp-dev-guide', 'references', 'import-existing-project.md');
  const importGuide = readImportGuide(importGuidePath);
  const packedImportPath = path.join(CLI_DIR, 'docs', '07-import-existing-project.md');
  assert(fs.existsSync(packedImportPath) && fs.readFileSync(packedImportPath).equals(importGuide),
    'cli/docs/07 是 skill reference 正文的逐字导出，不是仓库导航页');
  const devGuide = fs.readFileSync(path.join(skillsDir, 'userapp-dev-guide', 'SKILL.md'), 'utf-8');
  assert(devGuide.includes('references/import-existing-project.md'), 'dev-guide 提供唯一导入正文的本地入口');
  assertLocalLinks(importGuidePath);
  assertLocalLinks(packedImportPath);
  const missingImportPath = path.join(WORKDIR, 'missing-import-reference.md');
  let missingImportError;
  try { readImportGuide(missingImportPath); }
  catch (error) { missingImportError = error; }
  assert(missingImportError?.message.includes('无法读取导入已有项目正文')
    && missingImportError?.message.includes(missingImportPath)
    && missingImportError?.cause?.code === 'ENOENT',
    '缺导入 reference 立即抛出带路径和原因的错误');
  const emptyImportPath = path.join(WORKDIR, 'empty-import-reference.md');
  fs.writeFileSync(emptyImportPath, '\n  \n');
  let emptyImportError;
  try { readImportGuide(emptyImportPath); }
  catch (error) { emptyImportError = error; }
  assert(emptyImportError?.cause?.message === '导入正文不能为空',
    '空导入 reference 不能被打成成功分发物');

  // 经目录别名直接执行完整 pack：不能静默跳过入口，也不能先清输出再发现缺正文。
  const packFixture = path.join(WORKDIR, 'pack-reference-fixture');
  for (const dir of ['cli/scripts', 'cli/templates', 'cli/docs', 'docs']) {
    fs.mkdirSync(path.join(packFixture, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(CLI_DIR, 'scripts', 'pack-templates.mjs'),
    path.join(packFixture, 'cli', 'scripts', 'pack-templates.mjs'));
  const outputMarkers = ['cli/templates/sentinel', 'cli/docs/sentinel'];
  for (const marker of outputMarkers) fs.writeFileSync(path.join(packFixture, marker), 'preserve output');
  const packAlias = path.join(WORKDIR, 'pack-reference-alias');
  fs.symlinkSync(packFixture, packAlias, 'junction');
  let packFailure;
  try { run(`node "${path.join(packAlias, 'cli', 'scripts', 'pack-templates.mjs')}"`, { timeout: 10000 }); }
  catch (error) { packFailure = error; }
  assert(packFailure?.status === 1 && String(packFailure.stderr).includes('无法读取导入已有项目正文'),
    '目录别名启动 pack 时实际进入入口，并对缺正文失败');
  assert(outputMarkers.every((marker) => fs.readFileSync(path.join(packFixture, marker), 'utf-8') === 'preserve output'),
    '完整 pack 缺正文失败发生在清理原 templates/docs 之前');

  // === init: go + react ===
  console.log('\n=== init: go + react ===');
  run(`${CLI} init "${path.join(WORKDIR, 'test-app')}" --backend go --frontend react`);
  const appDir = path.join(WORKDIR, 'test-app');

  assert(fs.existsSync(path.join(appDir, 'workspace.manifest.toml')), 'workspace.manifest.toml 存在');
  assert(fs.existsSync(path.join(appDir, 'index.html')), '非 catch-all workspace 生成入口首页');
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
  assert(agentsContent.includes('npx skills add https://github.com/nuwax-ai/userapp-workspace-template/tree/main'), 'AGENTS.md 含 skills 安装命令');
  assert(agentsContent.includes('| /api/go/ |'), 'AGENTS.md 结构表含服务路由列');
  assert(agentsContent.includes('template-cli list backend'), 'AGENTS.md 含模板发现命令');
  assert(agentsContent.includes('结构快照'), 'AGENTS.md 声明为结构快照(规范以 skills 为准)');
  assert(agentsContent.includes('0.0.0.0:$PORT'), 'AGENTS.md 含端口契约(manifest 契约保留)');
  assert(!agentsContent.includes('Go + React') && !agentsContent.includes('Python + React'), 'AGENTS.md 不含默认选型策略');
  assert(agentsContent.includes('dev-guide 的“导入已有项目”')
    && agentsContent.includes('docs/07-import-existing-project.md'),
    'AGENTS.md 引导现有业务导入先读 dev-guide 入口与随包 docs07');
  assert((agentsContent.match(/^- \*\*userapp-[^*]+\*\*:/gm) ?? []).length === 2,
    '生成 AGENTS 仅列现有两个 skill');
  assert(agentsContent.includes('各一级服务目录') && !agentsContent.includes('每个一级子目录'),
    'AGENTS.md 只要求真正的服务目录有 project manifest');
  assert(agentsContent.includes('app-cli validate --help')
    && agentsContent.includes('app-cli validate --workspace .')
    && agentsContent.includes('只读配置检查'),
    '生成 AGENTS 在核对能力后引导只读 validate');
  assert(agentsContent.includes('app-cli gen-lock --workspace .')
    && agentsContent.includes('旧版兼容检查')
    && agentsContent.includes('不新增启动/停止门禁'),
    '生成 AGENTS 保留 gen-lock 生成职责与明确的旧版兼容边界');

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

  // === 根 .gitignore(init 根产物) ===
  const rootGi = fs.readFileSync(path.join(appDir, '.gitignore'), 'utf-8');
  assert(rootGi.includes('/release.lock.toml') && rootGi.includes('/.local-deploy/') && rootGi.includes('/.local-logs/'), '根 .gitignore 忽略 app-cli 本地编排产物');
  assert(rootGi.includes('/builds/') && rootGi.includes('/.run/') && rootGi.includes('/.previous/') && rootGi.includes('/.staging/'), '根 .gitignore 忽略平台根目录产物');

  // === add: rust with custom service_id ===
  console.log('\n=== add: rust custom service_id ===');
  run(`${CLI} add backend-rust --service-id my-rust-api --path /api/rust-v2/`, { cwd: appDir });
  const cargoPath = path.join(appDir, 'my-rust-api', 'Cargo.toml');
  const cargo = fs.readFileSync(cargoPath, 'utf-8');
  assert(cargo.includes('name = "my-rust-api"'), 'Cargo crate 名派生为 my-rust-api');
  assert(cargo.includes('"axum", "vendored"'), 'utoipa-swagger-ui 启用 vendored(构建期零外网)');
  const mavenWrapper = fs.readFileSync(
    path.join(CLI_DIR, 'templates', 'backend-java', '.mvn', 'wrapper', 'maven-wrapper.properties'),
    'utf-8',
  );
  assert(mavenWrapper.includes('maven.aliyun.com'), 'Java Maven wrapper 保留国内镜像');

  // === 模板 .gitignore 覆盖构建产物(防回归) ===
  // 生成的用户 workspace 没有根 .gitignore 兜底,产物 ignore 完全靠各模板自带的
  // .gitignore 随包分发;新模板漏写或改名,产物就会被 agent 误提交进 git。
  // 注意:pack 阶段 .gitignore 改名为 _gitignore(npm pack 会把包内 .gitignore
  // 当打包排除规则,直接丢出 tarball),release 时还原
  const gitignoreCoverage = {
    'backend-go': ['artifact.zip', '/server', '/logs/'],
    'backend-java': ['artifact.zip', 'app.jar', '/target/', '/logs/'],
    'backend-python': ['artifact.zip', 'deps/', '__pycache__/', '.pip-cache/', '.deps-stamp', '.pytest_cache/'],
    'worker-python': ['artifact.zip', '__pycache__/', 'logs/'],
    'backend-rust': ['artifact.zip', '/server', '/target/', '/logs/'],
    'frontend-react-vite': ['node_modules/', 'dist/'],
    'frontend-vue3-vite': ['node_modules/', 'dist/'],
    'userapp-next': ['/node_modules', '/.next/', 'userapp-next-standalone.zip'],
  };
  for (const [tpl, patterns] of Object.entries(gitignoreCoverage)) {
    const giPath = path.join(CLI_DIR, 'templates', tpl, '_gitignore');
    assert(fs.existsSync(giPath), `模板 ${tpl} 自带 _gitignore`);
    const gi = fs.readFileSync(giPath, 'utf-8');
    for (const p of patterns) {
      assert(gi.includes(p), `模板 ${tpl} .gitignore 覆盖产物规则 ${p}`);
    }
  }

  // === npm tarball 防回归:模板文件不得被 npm pack 排除 ===
  // npm-packlist 会把包内各目录的 .gitignore 当作打包排除规则——不仅 .gitignore
  // 自身丢失,userapp-next 模板 .gitignore 里的 .env*/next-env.d.ts 规则还曾连带
  // 把这两个文件排除出 tarball(历史事故:0.1.18 及之前所有 npm 包都缺这些文件)。
  // 本地 dist/templates 链路测不到 npm 打包,必须对着真实 tarball 清单断言
  // npm pack --json 的 path 相对包根,不带 tarball 内的 package/ 前缀
  const packJson = JSON.parse(run('npm pack --dry-run --json', { cwd: CLI_DIR }));
  const tarballFiles = new Set(packJson[0].files.map((f) => f.path.replace(/^\.\//, '')));
  for (const tpl of Object.keys(gitignoreCoverage)) {
    assert(tarballFiles.has(`templates/${tpl}/_gitignore`), `npm 包含 templates/${tpl}/_gitignore`);
  }
  assert(![...tarballFiles].some((f) => f.endsWith('/.gitignore')), 'npm 包不含裸 .gitignore(会被 pack 排除,须以 _gitignore 承载)');
  assert(tarballFiles.has('templates/userapp-next/.env.example') && tarballFiles.has('templates/userapp-next/next-env.d.ts'), 'npm 包含曾被 .gitignore 规则连带排除的 .env.example/next-env.d.ts');
  assert(tarballFiles.has('docs/07-import-existing-project.md'), 'npm 包分发导入已有项目正文');

  // === init: react 自定义 service_id + path(运行时读取 TOML,不生成第二份 base) ===
  console.log('\n=== init: react custom service_id + path ===');
  const packedVite = fs.readFileSync(
    path.join(CLI_DIR, 'templates', 'frontend-react-vite', 'vite.config.ts'),
    'utf-8',
  );
  assert(packedVite.includes('readManifestBase('), 'pack 保留 manifest 路由读取入口');
  const packedClaude = fs.readFileSync(
    path.join(CLI_DIR, 'templates', 'frontend-react-vite', 'CLAUDE.md'),
    'utf-8',
  );
  assert(packedClaude === '@AGENTS.md\n', '前端模板 CLAUDE.md 归一为 @AGENTS.md(无内容副本)');

  run(`${CLI} init "${path.join(WORKDIR, 'test-web')}" --frontend react --service-id my-web --path /admin/`);
  const webDir = path.join(WORKDIR, 'test-web', 'my-web');
  const webVite = fs.readFileSync(path.join(webDir, 'vite.config.ts'), 'utf-8');
  assert(
    webVite === packedVite,
    '自定义路由不改写 vite.config.ts',
  );

  const webManifest = fs.readFileSync(path.join(webDir, 'project.manifest.toml'), 'utf-8');
  assert(webManifest.includes('service_id = "my-web"'), 'manifest 自定义 service_id');
  assert(webManifest.includes('path = "/admin/"'), 'manifest 自定义 proxy path');
  assert(webManifest.includes('strip_prefix = true\ndev_strip_prefix = false'), 'react prod 剥前缀、dev 保留前缀');
  assert(webManifest.includes('type = "static"'), 'static 形态 type = static');
  assert(!webManifest.includes('[run]'), 'static 无 [run] 段(平台内置静态托管)');

  // 复用 CLI 安装的 TOML 解析器,无需为生成的测试项目另做 npm install。
  fs.symlinkSync(path.join(CLI_DIR, 'node_modules'), path.join(WORKDIR, 'node_modules'), 'junction');
  const { readManifestBase } = await import(pathToFileURL(path.join(webDir, 'scripts/manifest-routing.mjs')).href);
  const webManifestUrl = pathToFileURL(path.join(webDir, 'project.manifest.toml'));
  assert(readManifestBase(webManifestUrl) === '/admin/', '自定义路由由生成的 TOML 读取');
  fs.writeFileSync(webManifestUrl, webManifest.replace('path = "/admin/"', "  path = '/console/'"));
  assert(readManifestBase(webManifestUrl) === '/console/', '仅改 TOML(单引号/缩进)即读取新 base');
  let routeConflict = '';
  try {
    run(`${CLI} add frontend-vue3-vite --service-id portal-web --path /console`, { cwd: path.dirname(webDir) });
  } catch (error) {
    routeConflict = String(error.stderr);
  }
  assert(routeConflict.includes('proxy.path 冲突') && !fs.existsSync(path.join(path.dirname(webDir), 'portal-web')),
    '正式解析已有 TOML,在创建目录前拒绝 /console 与 /console/ 冲突');
  const validManifest = fs.readFileSync(webManifestUrl, 'utf-8');
  let rejected = 0;
  for (const content of ['[proxy', '[project]\nservice_id="my-web"', '[proxy]\npath="//other-host/"', '[proxy]\npath="/admin//"']) {
    fs.writeFileSync(webManifestUrl, content);
    try { readManifestBase(webManifestUrl); } catch { rejected++; }
  }
  fs.unlinkSync(webManifestUrl);
  try { readManifestBase(webManifestUrl); } catch { rejected++; }
  assert(rejected === 5, '缺文件、坏 TOML、缺路径和非法路径不回退到根路由');
  fs.writeFileSync(webManifestUrl, validManifest);

  // === add: worker ===
  console.log('\n=== add: worker ===');
  // 先删根 database/ 模拟旧版 CLI 产物,验证 add 兜底补齐
  fs.rmSync(path.join(appDir, 'database'), { recursive: true, force: true });
  run(`${CLI} add backend-python --kind worker --service-id bg-worker`, { cwd: appDir });
  const workerManifest = fs.readFileSync(path.join(appDir, 'bg-worker', 'project.manifest.toml'), 'utf-8');
  assert(workerManifest.includes('kind = "worker"'), 'worker kind = worker');
  assert(!workerManifest.includes('[proxy]'), 'worker 无 [proxy] 段');
  const workerConfig = parseToml(workerManifest);
  const workerEntry = fs.readFileSync(path.join(appDir, 'bg-worker', 'main.py'), 'utf-8');
  assert(
    workerConfig.health?.readiness_path === '/ready'
      && !('startup_probe' in workerConfig.health)
      && workerEntry.includes('uvicorn.run(app, host="0.0.0.0", port=settings.port)')
      && agentsContent.includes('kind=worker')
      && agentsContent.includes('不公开代理路由'),
    'worker 生成物与 AGENTS 一致：保留 HTTP 健康入口，不提前输出新探针字段',
  );
  assert(fs.existsSync(path.join(appDir, 'database', 'README.md')), 'add 兜底补齐根 database/README.md');

  // Process worker is a distinct generated contract; legacy HTTP worker stays intact.
  run(`${CLI} add worker-python --service-id queue-worker`, { cwd: appDir });
  const queueDir = path.join(appDir, 'queue-worker');
  const queue = parseToml(fs.readFileSync(path.join(queueDir, 'project.manifest.toml'), 'utf8'));
  assert(queue.project.kind === 'worker' && queue.health.startup_probe === 'process'
    && !queue.proxy && !queue.health.readiness_path && queue.run.command.join(' ') === 'python3 main.py',
    'process worker 的 kind/探针/run 一致，无 proxy 或 HTTP 路径');
  run('python3 scripts/build.py', { cwd: queueDir });
  assert(fs.statSync(path.join(queueDir, 'artifact.zip')).size > 0, 'process worker 可构建独立制品');
  const sentinel = path.join(appDir, 'invalid-worker');
  fs.mkdirSync(sentinel);
  fs.writeFileSync(path.join(sentinel, 'keep.txt'), 'preserve');
  for (const options of ['worker-python --kind web', 'frontend-vue3-vite --kind worker', 'worker-python --path /queue/']) {
    let rejected = false;
    try { run(`${CLI} add ${options} --service-id invalid-worker --force`, { cwd: appDir }); }
    catch { rejected = true; }
    assert(rejected && fs.readFileSync(path.join(sentinel, 'keep.txt'), 'utf8') === 'preserve', `非法组合在覆盖目录前拒绝: ${options}`);
  }

  // === add: vue(add 入口的 devbuild 断言) ===
  console.log('\n=== add: vue devbuild ===');
  run(`${CLI} add frontend-vue3-vite`, { cwd: appDir });
  const vueManifest = fs.readFileSync(path.join(appDir, 'frontend-vue3-vite', 'project.manifest.toml'), 'utf-8');
  assert(
    fs.readFileSync(path.join(webDir, 'scripts/manifest-routing.mjs'), 'utf-8') ===
    fs.readFileSync(path.join(appDir, 'frontend-vue3-vite/scripts/manifest-routing.mjs'), 'utf-8'),
    'React/Vue 共用相同的路由读取规则',
  );
  assert(vueManifest.includes('strip_prefix = true\ndev_strip_prefix = false'), 'vue prod 剥前缀、dev 保留前缀');
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
  assert(
    !fs.existsSync(path.join(WORKDIR, 'test-next', 'index.html')) &&
    !fs.readFileSync(path.join(WORKDIR, 'test-next', 'AGENTS.md'), 'utf-8').includes('index.html'),
    'catch-all workspace 不生成首页或指引 agent 修改不存在的首页',
  );

  // === --next + --backend 冲突 ===
  console.log('\n=== --next + --backend 冲突检测 ===');
  let nextConflict = false;
  try {
    run(`${CLI} init "${path.join(WORKDIR, 'bad')}" --next --backend go`, { stdio: 'pipe' });
  } catch {
    nextConflict = true;
  }
  assert(nextConflict, '--next + --backend 被拒绝');

  // === 根 .gitignore 并集合并(已存在的根 .gitignore 不被覆盖) ===
  console.log('\n=== init: 根 .gitignore 并集合并 ===');
  const mergeDir = path.join(WORKDIR, 'test-gitignore-merge');
  fs.mkdirSync(mergeDir, { recursive: true });
  // 模拟 git init 过/手工维护过的目录:含注释、手工条目、以及一条与 CLI 规则等价
  // 但写法不同的条目(无前导 /,应识别为已覆盖、不重复追加)
  fs.writeFileSync(path.join(mergeDir, '.gitignore'), '# 手工维护\nnotes/\n.local-deploy/\n');
  run(`${CLI} init "${mergeDir}" --backend python --force`);
  const mergedGiPath = path.join(mergeDir, '.gitignore');
  const mergedGi = fs.readFileSync(mergedGiPath, 'utf-8');
  assert(mergedGi.includes('# 手工维护') && mergedGi.includes('notes/'), '根 .gitignore 合并保留手工条目');
  assert(!mergedGi.includes('/.local-deploy/'), '根 .gitignore 等价写法识别为已覆盖(不重复追加)');
  assert(mergedGi.includes('/release.lock.toml') && mergedGi.includes('/.staging/'), '根 .gitignore 合并补齐缺失规则');
  run(`${CLI} init "${mergeDir}" --backend python --force`);
  const mergedGi2 = fs.readFileSync(mergedGiPath, 'utf-8');
  run(`${CLI} init "${mergeDir}" --backend python --force`);
  assert(mergedGi2 === fs.readFileSync(mergedGiPath, 'utf-8'), '根 .gitignore 合并幂等(重复 init 不追加)');
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

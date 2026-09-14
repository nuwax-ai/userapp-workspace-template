/**
 * manifest 生成器 —— 根据模板元数据 + 用户参数,生成 project.manifest.toml 和 workspace.manifest.toml。
 *
 * 不拷贝模板源里的原 manifest,而是重新生成,确保 service_id / proxy.path / logs.glob 一致。
 */

import type { TemplateMeta } from './templates.js';

export interface ProjectManifestOptions {
  template: TemplateMeta;
  serviceId: string;
  proxyPath: string;
  /** 是否生成 [proxy] 段(worker 不需要)。默认 web = true */
  includeProxy?: boolean;
}

/**
 * 生成单个 service 的 project.manifest.toml。
 * 格式与各模板源里的 manifest 保持一致(缩进、字段顺序)。
 */
export function generateProjectManifest(opts: ProjectManifestOptions): string {
  const { template, serviceId, proxyPath, includeProxy = true } = opts;
  const d = template.defaults;

  const lines: string[] = [
    'schema_version = 1',
    '',
    '[project]',
    `service_id = "${serviceId}"`,
    `name = "${template.name}"`,
    `type = "${template.type}"`,
  ];

  // worker 不输出 kind(web 是默认值,省略)
  if (template.kind === 'worker') {
    lines[lines.length - 1] += `\nkind = "worker"`;
  }

  // build 段 —— 各模板的构建命令和产物路径不同,从模板类型推断
  const buildInfo = getBuildInfo(template);
  lines.push(
    '',
    '[build]',
    `command = ${formatArgv(buildInfo.command)}`,
    `artifact = "${buildInfo.artifact}"`,
  );

  // devbuild 段 —— dev 阶段编译/准备命令(依赖安装/type-check 等,不要求产出 artifact)
  if (buildInfo.devbuild) {
    lines.push('', '[devbuild]', `command = ${formatArgv(buildInfo.devbuild)}`);
  }

  // run 段 —— static 形态（无进程，内置静态托管承载）省略整段
  if (buildInfo.run.length > 0) {
    const runLines: string[] = ['', '[run]', `command = ${formatArgv(buildInfo.run)}`];
    if (buildInfo.migrate) {
      runLines.push(`migrate = ${formatArgv(buildInfo.migrate)}`);
    }
    lines.push(...runLines);
  }

  // devrun 段 —— dev 阶段热加载启动命令（配置即声明 dev 态自足：未配 devbuild
  // 则跳过编译，dev 命令跑源码不消费构建产物）
  if (buildInfo.devrun) {
    lines.push('', '[devrun]', `command = ${formatArgv(buildInfo.devrun)}`);
  }

  // health 段 —— 模板显式声明的路径都输出(即使等于默认 /health,保持与源 manifest 一致)
  const healthParts: string[] = [];
  if (d.startupPath) {
    healthParts.push(`startup_path = "${d.startupPath}"`);
  }
  if (d.readinessPath) {
    healthParts.push(`readiness_path = "${d.readinessPath}"`);
  }
  if (d.livenessPath) {
    healthParts.push(`liveness_path = "${d.livenessPath}"`);
  }
  if (healthParts.length > 0) {
    lines.push('', '[health]', ...healthParts);
  }

  // proxy 段(worker 禁止)
  if (includeProxy && template.kind === 'web') {
    const proxyLines = ['', '[proxy]', `path = "${proxyPath}"`];
    if (d.stripPrefix) {
      proxyLines.push('strip_prefix = true');
    }
    lines.push(...proxyLines);
  }

  // logs 段 —— static 形态（无进程）不生成（无运行时文件日志）；
  // 其余模板替换 logGlob 里的 __SERVICE_ID__ 占位符
  const logLines: string[] = [];
  if (template.type !== 'static') {
    const logGlob = d.logGlob.replaceAll('__SERVICE_ID__', serviceId);
    logLines.push(
      '',
      '[[logs.sources]]',
      `id = "${d.logSourceId}"`,
      `glob = "${logGlob}"`,
      `format = "${d.logFormat}"`,
    );
  }
  if (d.multilineStartPattern) {
    // TOML basic string 不接受 \d 等未定义转义——正则里的反斜杠须翻倍转义
    const escaped = d.multilineStartPattern.replace(/\\/g, '\\\\');
    logLines.push(`multiline_start_pattern = "${escaped}"`);
  }
  lines.push(...logLines);

  let result = lines.join('\n') + '\n';

  // 替换 manifest 内的占位符(如 Next.js 的 __ARTIFACT_NAME__)
  for (const [k, v] of Object.entries(template.variables)) {
    const placeholder = `__${k}__`;
    if (result.includes(placeholder)) {
      result = result.split(placeholder).join(v);
    }
  }

  return result;
}

/**
 * 生成 workspace.manifest.toml(根目录)。
 * 包含生效的 workspace 声明 + 可选配置段的注释模板,
 * 让用户拿到 workspace 后就知道有哪些可选项。
 */
export function generateWorkspaceManifest(workspaceName: string, description?: string): string {
  const lines: string[] = [
    'schema_version = 1',
    '',
    '[workspace]',
    `name = "${workspaceName}"`,
  ];
  if (description) {
    lines.push(`description = "${description}"`);
  }
  lines.push(
    '',
    '# [pingap] 默认即为 managed(平台按各 web 服务的 [proxy] 自动生成路由),无需声明。',
    '# 需要切 extend/custom 反代模式、或把 /ready 桥接到某后端时,再按需打开下面的段:',
    '#',
    '# [pingap]',
    '# mode = "managed"              # managed / extend / custom',
    '# config = "pingap/"            # 仅 extend/custom',
    '#',
    '# [health]',
    '# bridge_service = "backend-go" # 可选:把整个 workspace 的 /ready 桥接到该后端深检查',
    '',
  );
  return lines.join('\n');
}

/**
 * 生成 workspace 根目录的 AGENTS.md。
 *
 * 这是一个精简的 Agent 指引,让 Agent 在用户用 CLI 创建的新 workspace 里工作时,
 * 知道:项目结构(目录↔类型↔路由)、平台约束、怎么装 skills、怎么用 CLI 追加 service。
 * @param hasIndexHtml workspace 根是否生成了 index.html 导航页(catch-all 服务
 *   独占 / 时 init 不生成,结构表也不列该行)。默认 true。
 */
export function generateAgentsMd(
  workspaceName: string,
  services: Array<{ name: string; dir: string; type: string; proxyPath?: string }>,
  hasIndexHtml = true,
): string {
  const serviceLines = services
    .map((s) => `| ${s.dir}/ | ${s.type} | ${s.proxyPath ?? '—'} |`)
    .join('\n');
  const indexRow = hasIndexHtml ? '\n| `index.html` | 入口导航页 | 根路径/未匹配路径兜底 |' : '';
  const tableNote = hasIndexHtml
    ? [
        '> 用 `add` 追加服务后,此表与 `index.html` 的导航卡片**都不会自动更新**;各服务实际路由',
        '> 以其 `project.manifest.toml` 的 `[proxy]` 为准,追加/删除对外服务后记得同步维护导航卡片。',
      ].join('\n')
    : '> 用 `add` 追加服务后此表不会自动更新;各服务实际路由以其 `project.manifest.toml` 的 `[proxy]` 为准。';

  return `# ${workspaceName} — Agent Guide

> 本 workspace 由 \`@nuwax-ai/template-cli\` 生成。

## Skills(按需)

若运行环境已预置这些 skills(如平台沙箱),直接使用即可,**跳过安装**;
本地开发可安装以获得完整规范指引:

\`\`\`bash
npx skills add nuwax-ai/userapp-workspace-template
\`\`\`

- **userapp-scaffold**: CLI 脚手架使用(init/add/list 命令)
- **userapp-dev-guide**: 平台开发规范(manifest 字段/路由/健康检查/日志/部署/排错)

## 项目结构

| 目录 | 类型 | 对外路由 |
|---|---|---|
${serviceLines}${indexRow}

${tableNote}

## 平台核心约束

1. **服务必须监听 \`0.0.0.0:$PORT\`** — 不能硬编码端口
2. **两个 manifest** — 根 \`workspace.manifest.toml\` + 每个子目录 \`project.manifest.toml\`
3. **严格校验,Fail Fast** — 配置错误构建立即失败
4. **service_id 是稳定身份** — 不是目录名,决定日志目录/路由 upstream/依赖引用
5. **回滚不执行 down migration** — 迁移必须幂等 + expand/contract
6. **database/ 目录 = 发布时自动执行的 SQL** — 根 \`database/\` 先、子项目按目录字典序;
   SQL 须幂等,单文件失败仅日志不阻断发布;**开发阶段不自动执行**,schema 变更需手动
   执行(dbx/psql)后再放入。详见 \`database/README.md\`
7. **static 服务无进程** — \`type = "static"\` 的服务(前端 SPA 模板)禁止 \`[run]\` 段,
   \`[build].artifact\` 为静态内容目录,由平台内置静态托管承载(SPA fallback)

> 完整规范参考 **userapp-dev-guide** skill 或 \`npx @nuwax-ai/template-cli docs\`。

## 追加 Service

\`\`\`bash
npx @nuwax-ai/template-cli list backend    # 查看可用模板(backend / frontend)
npx @nuwax-ai/template-cli add backend-rust
# 追加同类模板的第二个实例(如第二个 java 后端)须同时指定新身份与路由,默认身份会冲突被拒:
npx @nuwax-ai/template-cli add backend-java --service-id java-admin --path /api/java-admin/
npx @nuwax-ai/template-cli add backend-python --kind worker --service-id my-worker
\`\`\`
`;
}

/**
 * workspace 根 CLAUDE.md 内容:Claude Code 的 @import 指令,展开读取 AGENTS.md。
 * 不用软链——Windows 创建软链需开发者权限,且本仓库 pack/release 链路会丢弃软链;
 * 单行导入零维护成本,与 userapp-next-template 子项目的既有做法一致。
 */
export const CLAUDE_MD_CONTENT = '@AGENTS.md\n';

/**
 * 生成 workspace 根 database/README.md(SQL 约定目录的说明)。
 *
 * 内容必须与模板仓库根 `database/README.md` **逐字一致**(test-local.mjs 强校验相等,
 * 防两处漂移):改任一侧时必须同步另一侧。
 */
export function generateDatabaseReadme(): string {
  return `# database 目录 —— 平台自动执行的 SQL 约定

发布（activate）成功后，平台会自动按序执行包内 \`database/\` 目录下的 \`.sql\` 文件。

> ⚠️ **开发阶段不会自动执行**：本地 devrun / 沙箱调试时，本目录里的 SQL 不会被跑——
> schema 变更需先手动执行（dbx / psql 连开发库），再同步放入本目录随发布生效。

## 执行规则

- **执行顺序**：workspace 根 \`database/\` 先执行（适合建库、扩展、初始化类 SQL），
  之后各子项目 \`{项目目录}/database/\` 按**目录名字典序**执行；
  每个目录内按**文件名字典序**（建议用 \`001_\`、\`002_\` 前缀显式控制顺序）。
- **只扫一层**：仅 \`database/\` 的直接子文件，子目录不递归；非 \`.sql\` 文件
  （如本 README）不执行也不进发布包。
- **文件名白名单**：\`[A-Za-z0-9._-]\`（平台防注入校验）——**中文/空格/特殊字符的
  文件名会被静默跳过**（仅 warn 日志），如 \`建表.sql\` 不会执行。
- **目标数据库**：app 运行容器内的 PG（\`$POSTGRES_USER\` / \`$POSTGRES_DB\`，容器 ENV）；
  执行前平台会等 PG 就绪（≤60s），未就绪则本轮整体跳过。
- **幂等性要求**：每次发布都会重新执行全部 SQL 文件（无执行记录表）——
  SQL 必须自带幂等性（如 \`CREATE TABLE IF NOT EXISTS\`、\`ON CONFLICT DO NOTHING\`）。
- **失败语义**：单文件执行失败（语法/约束错误）只记录日志并跳过，**不阻断发布**——
  修复 SQL 后重新发布即可；文件内 \`ON_ERROR_STOP=on\`，单个文件内出错即中止该文件。
  （部署请求可用 \`auto_execute_sql=false\` 关闭本机制，缺省开。）

## 与 \`run.migrate\` 的边界

| | \`database/\` 目录（本约定） | \`run.migrate\`（project.manifest） |
|---|---|---|
| 执行者 | 平台（发布 activate 后，rcoder exec psql） | app-cli（服务启动前，应用自管迁移命令） |
| 失败 | 仅日志，忽略 | 阻断启动 |
| 适用 | 建库/扩展/平台侧初始化 | 应用自身的 schema 迁移（如 drizzle） |

## 示例

\`\`\`
database/
├── 001_create_schema.sql
└── 002_seed_data.sql
backend-go/database/
└── 001_orders_table.sql
\`\`\`
`;
}

/** HTML 文本节点转义(workspace 名/服务名是用户输入,防意外破坏页面结构) */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 生成 workspace 根目录的 index.html(访问入口默认页)。
 *
 * 平台编排(app-cli)会在 workspace 根存在 index.html 且无服务占用 `/` 路由时,
 * 把入口根路径兜底到该页面。按 init 所选服务生成导航卡片;用户可自行修改,
 * 改完刷新即生效(每次请求实时读文件)。add 命令追加服务时不会自动更新此文件。
 */
export function generateIndexHtml(
  workspaceName: string,
  services: Array<{ name: string; proxyPath: string }>,
): string {
  const cards = services
    .map((s) => {
      const href = s.proxyPath.endsWith('/') ? `${s.proxyPath}` : `${s.proxyPath}/`;
      return `      <a class="card" href="${href}">
        <div class="card-title">${escapeHtml(s.name)}</div>
        <div class="card-path">${escapeHtml(s.proxyPath)}</div>
      </a>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<!--
  ${escapeHtml(workspaceName)} — 访问入口默认页(可自行修改,改完刷新即生效)。

  - 服务路由前缀(如 /api/xxx、/react)由各服务 project.manifest.toml [proxy] 决定,恒优先;
  - 本页面仅作为入口根路径(/)与未匹配路径的兜底展示;
  - 追加服务后想加导航卡片,直接编辑下方 cards 区域即可。
-->
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(workspaceName)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f6f7f9; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
    main { text-align: center; padding: 2rem; }
    h1 { color: #1f2328; font-size: 1.6rem; margin-bottom: .4rem; }
    p.hint { color: #6a737d; font-size: .9rem; margin-top: 0; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2rem; max-width: 640px; }
    .card { display: block; background: #fff; border: 1px solid #e1e4e8; border-radius: 10px; padding: 1.1rem 1.3rem; text-decoration: none; transition: box-shadow .15s, transform .15s; }
    .card:hover { box-shadow: 0 4px 14px rgba(0,0,0,.08); transform: translateY(-2px); }
    .card-title { color: #24292f; font-weight: 600; }
    .card-path { color: #0969da; font-size: .82rem; margin-top: .25rem; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(workspaceName)}</h1>
    <p class="hint">UserApp workspace — 服务入口导航(可编辑此页面)</p>
    <div class="cards">
${cards}
    </div>
  </main>
</body>
</html>
`;
}

/* ── 内部:构建命令/产物/运行命令的 per-type 推断 ─────────── */

interface BuildInfo {
  command: string[];
  artifact: string;
  run: string[];
  migrate?: string[];
  /** dev 阶段编译/准备命令([devbuild] 段;依赖安装/type-check 等前端模板配) */
  devbuild?: string[];
  /** dev 阶段热加载启动命令([devrun] 段;前端模板配) */
  devrun?: string[];
}

function getBuildInfo(template: TemplateMeta): BuildInfo {
  switch (template.id) {
    case 'backend-go':
      return {
        command: ['sh', 'scripts/build-standalone.sh'],
        artifact: 'artifact.zip',
        run: ['./server'],
      };
    case 'backend-java':
      return {
        command: ['sh', 'scripts/build-standalone.sh'],
        artifact: 'artifact.zip',
        run: ['java', '-jar', 'app.jar'],
      };
    case 'backend-python':
      return {
        command: ['sh', 'scripts/build-standalone.sh'],
        artifact: 'artifact.zip',
        run: ['python3', 'main.py'],
      };
    case 'backend-rust':
      return {
        command: ['sh', 'scripts/build-standalone.sh'],
        artifact: 'artifact.zip',
        run: ['./server'],
      };
    case 'frontend-react-vite':
      return {
        command: ['sh', 'scripts/build-standalone.sh'],
        // static 形态：artifact = 静态内容目录（构建产 dist；无 [run] 段——
        // 平台内置静态托管承载）
        artifact: 'dist',
        run: [],
        // dev 准备/检查：依赖安装前置（vite/tsc 都在 node_modules）+ type-check
        devbuild: ['sh', '-c', 'pnpm install --frozen-lockfile && pnpm run type-check'],
        devrun: ['pnpm', 'exec', 'vite'],
      };
    case 'frontend-vue3-vite':
      return {
        command: ['sh', 'scripts/build-standalone.sh'],
        artifact: 'dist',
        run: [],
        // dev 准备：依赖安装（vite dev 跑源码不消费 dist，未配则跳过编译但依赖没人装）
        devbuild: ['pnpm', 'install', '--frozen-lockfile'],
        devrun: ['pnpm', 'exec', 'vite'],
      };
    case 'userapp-next':
      return {
        command: ['npm', 'run', 'build:standalone'],
        artifact: '__ARTIFACT_NAME__.zip',
        run: ['node', 'server.js'],
        migrate: ['node', 'migrate.js'],
        // dev 准备：依赖安装（next dev 跑源码，不消费 standalone 产物）
        devbuild: ['npm', 'install'],
        devrun: ['npm', 'run', 'dev'],
      };
    default:
      throw new Error(`Unknown template: ${template.id}`);
  }
}

/** 把 argv 数组格式化为 TOML 内联数组 */
function formatArgv(arr: string[]): string {
  return '[' + arr.map((s) => `"${s}"`).join(', ') + ']';
}

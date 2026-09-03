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

  // run 段 —— static 形态（无进程，内置静态托管承载）省略整段
  if (buildInfo.run.length > 0) {
    const runLines: string[] = ['', '[run]', `command = ${formatArgv(buildInfo.run)}`];
    if (buildInfo.migrate) {
      runLines.push(`migrate = ${formatArgv(buildInfo.migrate)}`);
    }
    lines.push(...runLines);
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
 * 知道:项目结构、平台约束、怎么装 skills、怎么用 CLI 追加 service。
 */
export function generateAgentsMd(workspaceName: string, services: Array<{ name: string; dir: string; type: string }>): string {
  const serviceLines = services.map((s) => `| ${s.dir}/ | ${s.type} |`).join('\n');

  return `# ${workspaceName} — Agent Guide

> 本 workspace 由 \`@nuwax-ai/template-cli\` 生成。开发前请先安装 AI skills。

## 安装 Skills(重要)

\`\`\`bash
npx skills add nuwax-ai/userapp-workspace-template
\`\`\`

安装后 Agent 将获得:
- **userapp-scaffold**: CLI 脚手架使用(init/add/list 命令)
- **userapp-dev-guide**: 平台开发规范(manifest 字段/路由/健康检查/日志/部署/排错)

## 项目结构

| 目录 | 类型 |
|---|---|
${serviceLines}

## 平台核心约束

1. **服务必须监听 \`0.0.0.0:$PORT\`** — 不能硬编码端口
2. **两个 manifest** — 根 \`workspace.manifest.toml\` + 每个子目录 \`project.manifest.toml\`
3. **严格校验,Fail Fast** — 配置错误构建立即失败
4. **回滚不执行 down migration** — 迁移必须幂等

> 完整规范参考 **userapp-dev-guide** skill 或 \`npx @nuwax-ai/template-cli docs\`。

## 追加 Service

\`\`\`bash
npx @nuwax-ai/template-cli add backend-rust
npx @nuwax-ai/template-cli add backend-python --kind worker --service-id my-worker
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
    case 'frontend-vue3-vite':
      return {
        command: ['sh', 'scripts/build-standalone.sh'],
        // static 形态：artifact = 静态内容目录（构建产 dist；无 [run] 段——
        // 平台内置静态托管承载）
        artifact: 'dist',
        run: [],
      };
    case 'userapp-next':
      return {
        command: ['npm', 'run', 'build:standalone'],
        artifact: '__ARTIFACT_NAME__.zip',
        run: ['node', 'server.js'],
        migrate: ['node', 'migrate.js'],
      };
    default:
      throw new Error(`Unknown template: ${template.id}`);
  }
}

/** 把 argv 数组格式化为 TOML 内联数组 */
function formatArgv(arr: string[]): string {
  return '[' + arr.map((s) => `"${s}"`).join(', ') + ']';
}

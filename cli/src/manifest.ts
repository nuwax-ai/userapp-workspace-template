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

  // run 段
  const runLines: string[] = ['', '[run]', `command = ${formatArgv(buildInfo.run)}`];
  if (buildInfo.migrate) {
    runLines.push(`migrate = ${formatArgv(buildInfo.migrate)}`);
  }
  lines.push(...runLines);

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

  // logs 段 —— 替换 logGlob 里的 __SERVICE_ID__ 占位符
  const logGlob = d.logGlob.replaceAll('__SERVICE_ID__', serviceId);
  const logLines: string[] = [
    '',
    '[[logs.sources]]',
    `id = "${d.logSourceId}"`,
    `glob = "${logGlob}"`,
    `format = "${d.logFormat}"`,
  ];
  if (d.multilineStartPattern) {
    logLines.push(`multiline_start_pattern = "${d.multilineStartPattern}"`);
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
        artifact: 'artifact.zip',
        run: ['node', 'static-server.cjs'],
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

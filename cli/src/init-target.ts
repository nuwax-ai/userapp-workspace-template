/** init 写入前核验：元数据与用户说明可以保留，业务内容走已有项目适配。 */
import fs from 'node:fs';
import path from 'node:path';

// 精确列出平台/Git 元数据；未知隐藏目录不能被默认当成空 workspace。
const METADATA_DIRECTORIES = new Set([
  '.agents', '.claude', '.codex', '.opencode', '.grok', '.pi', '.agent-store',
  '.tmp', '.logs', '.app-cli-state', 'state',
]);
const METADATA_FILES = new Set([
  '.npmrc', '.mcp.json', '.gitattributes', '.deploy-prepare.lock', '.deploy-state.toml',
  '.deploy-operation.lock', '.deploy-operation.json', '.deploy-coordinator.json', '.deploy-requests.json',
]);
const INSTRUCTION_FILES = new Set(['AGENTS.md', 'CLAUDE.md']);
// 仅空运行目录可忽略；有产物或业务代码时仍走已有项目适配。
const EMPTY_RUNTIME_DIRECTORIES = new Set(['code', 'builds', '.run']);

interface InitTargetOptions {
  serviceDirectories: string[];
  hasIndexHtml: boolean;
  force?: boolean;
}

function reject(target: string, reason: string): never {
  throw new Error(`${reason}: ${target}。已有项目请按 userapp-dev-guide 的导入指引增量适配，保留原目录；不要另建嵌套 workspace。`);
}

/** 保留的说明文件可以是链接；此处不读取、不跟随、更不覆盖链接目标。 */
export function hasRootInstructions(target: string, name: string): boolean {
  return fs.lstatSync(path.join(target, name), { throwIfNoEntry: false }) !== undefined;
}

export function validateInitTarget(target: string, opts: InitTargetOptions): void {
  if (opts.serviceDirectories.includes('database')) {
    reject(path.join(target, 'database'), 'CLI 模板目录与 workspace 根 SQL 目录冲突');
  }
  const root = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!root) return;
  if (root.isSymbolicLink()) reject(target, '初始化目标是符号链接，不能向链接目标写入');
  if (!root.isDirectory()) reject(target, '初始化目标必须是目录');

  // 先检查全部生成目标，避免写了根 manifest 后才发现模板或 database 冲突。
  const directories = [...opts.serviceDirectories, 'database'];
  for (const name of directories) {
    const absolute = path.join(target, name);
    const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) reject(absolute, '生成目录是符号链接，不能向链接目标写入');
    if (!opts.force) reject(absolute, '生成目录已存在，不能覆盖');
    // --force 会重建 service 目录，但 database 是原地写入，不能把文件当目录。
    if (name === 'database' && !stat.isDirectory()) reject(absolute, 'database 必须是目录');
  }
  const generatedFiles = ['workspace.manifest.toml', 'database/README.md'];
  if (opts.hasIndexHtml) generatedFiles.push('index.html');
  if (opts.force) generatedFiles.push(...INSTRUCTION_FILES);
  for (const name of [...generatedFiles, '.gitignore']) {
    const absolute = path.join(target, name);
    const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) reject(absolute, '生成文件是符号链接，不能向链接目标写入');
    if (!stat.isFile()) reject(absolute, '生成文件的路径类型不正确');
    if (!opts.force && generatedFiles.includes(name)) reject(absolute, '生成文件已存在，不能覆盖');
  }
  if (opts.force) return;

  for (const name of fs.readdirSync(target)) {
    const absolute = path.join(target, name);
    const stat = fs.lstatSync(absolute);
    if (name === '.gitignore') continue; // 已核验为真实文件；随后仅并集合并。
    if (INSTRUCTION_FILES.has(name) || /^README(?:\.[a-z0-9_-]+)?$/i.test(name)) {
      if (!stat.isFile() && !stat.isSymbolicLink()) reject(absolute, '根说明必须是文件');
      continue;
    }
    // 未写入的元数据链接只核验其类型，不递归访问内部（skill 视图可有合法链接）。
    const metadataStat = stat.isSymbolicLink() && (name === '.git' || METADATA_DIRECTORIES.has(name) || METADATA_FILES.has(name))
      ? fs.statSync(absolute) : stat;
    if (name === '.git' && (metadataStat.isDirectory() || metadataStat.isFile())) continue;
    if (METADATA_DIRECTORIES.has(name) && metadataStat.isDirectory()) continue;
    if (METADATA_FILES.has(name) && metadataStat.isFile()) continue;
    if (EMPTY_RUNTIME_DIRECTORIES.has(name) && stat.isDirectory() && fs.readdirSync(absolute).length === 0) continue;
    reject(absolute, '目录含已有业务内容或无法确认类型的元数据，不能初始化');
  }
}

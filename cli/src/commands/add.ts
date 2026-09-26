/**
 * add 命令 —— 往现有 workspace 追加 service。
 *
 * 用法:
 *   template-cli add <template-id> [--service-id <id>] [--path <path>] [--force]
 *
 * 流程:
 *  1. 确认当前目录是 workspace(有 workspace.manifest.toml)
 *  2. 扫描已有 service,读取它们的 service_id 和 proxy.path
 *  3. 校验新 service 无冲突
 *  4. 释放模板到子目录 + 参数化
 */

import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';
import type { Command } from 'commander';
import * as k from 'kolorist';
import { parse } from 'smol-toml';

import { getTemplate } from '../templates.js';
import { checkConflicts, validateServiceId, validateProxyPath, type ExistingService } from '../validate.js';
import { generateDatabaseReadme } from '../manifest.js';
import { releaseTemplate } from './release.js';

export interface AddOptions {
  serviceId?: string;
  path?: string;
  force?: boolean;
  /** 覆盖 kind: web(默认) / worker(后台服务,保留内部健康接口,不声明 proxy) */
  kind?: 'web' | 'worker';
}

export function registerAddCommand(program: Command): void {
  program
    .command('add <template-id>')
    .description('往当前 workspace 追加一个 service')
    .option('--service-id <id>', '覆盖默认 service_id')
    .option('--path <path>', '覆盖默认 proxy.path')
    .option('--kind <kind>', '服务类型: web / worker(默认沿用模板；worker 不声明 proxy)')
    .option('--force', '覆盖已存在的目录')
    .action(async (templateId: string, opts: AddOptions) => {
      await runAdd(templateId, opts);
    });
}

async function runAdd(templateId: string, opts: AddOptions): Promise<void> {
  // 解析模板
  const template = getTemplate(templateId);
  if (!template) {
    console.error(k.red(`✗ 未知模板: "${templateId}"`));
    console.error(k.gray('  用 list 命令查看所有可用模板。'));
    process.exit(1);
  }

  // 确认在 workspace 里
  const cwd = process.cwd();
  const wsManifest = path.join(cwd, 'workspace.manifest.toml');
  if (!fs.existsSync(wsManifest)) {
    console.error(k.red('✗ 当前目录不是 workspace(找不到 workspace.manifest.toml)'));
    console.error(k.gray('  请 cd 到 workspace 根目录,或用 init 命令新建。'));
    process.exit(1);
  }

  // 确定 serviceId
  const serviceId = opts.serviceId || template.defaults.serviceId;
  const idErr = validateServiceId(serviceId);
  if (idErr) {
    console.error(k.red(`✗ ${idErr}`));
    process.exit(1);
  }

  // 确定 kind(web 默认 / worker 后台任务)
  const kind = opts.kind ?? template.kind;
  const isWorker = kind === 'worker';
  if (!['web', 'worker'].includes(kind)
      || (template.defaults.startupProbe === 'process' && !isWorker)
      || (template.type === 'static' && isWorker)
      || (isWorker && opts.path !== undefined)) {
    console.error(k.red('✗ kind/path 与模板不兼容：process 仅用于 worker；static 不支持 worker；worker 不能声明 --path。'));
    process.exit(1);
  }

  // worker 不能声明 proxy.path
  const proxyPath = isWorker ? '' : opts.path || template.defaults.proxyPath;

  // 扫描已有 service
  const existing = scanExistingServices(cwd);

  // 校验冲突(worker 不参与 proxy.path 校验)
  const check = checkConflicts(serviceId, isWorker ? undefined : proxyPath, existing);
  if (!check.ok) {
    console.error(k.red('✗ 冲突校验失败:'));
    for (const e of check.errors) {
      console.error(k.red('  • ') + e);
    }
    process.exit(1);
  }

  // 目录存在性检查
  const targetDir = path.join(cwd, serviceId);
  if (fs.existsSync(targetDir) && !opts.force) {
    console.error(k.red(`✗ 目录已存在: ${targetDir}`));
    console.error(k.gray('  用 --force 覆盖。'));
    process.exit(1);
  }

  const kindLabel = isWorker ? k.yellow(' [worker]') : '';
  console.log(k.cyan('▶ 追加 service: ') + k.bold(`${template.name} → ${serviceId}/`) + kindLabel);

  // catch-all 服务独占 /:workspace 根的 index.html 兜底页不再生效(init 生成
  // 的导航页),提示用户可删——与 init 对 catch-all 跳过生成 index.html 的行为对齐。
  if (proxyPath === '/' && fs.existsSync(path.join(cwd, 'index.html'))) {
    console.log(k.gray('  - 注意: index.html 兜底页将不再生效(catch-all 服务独占 / 路由),可删除'));
  }

  // worker 覆盖模板的 kind 字段(用于 manifest 生成)
  const templateForRelease = { ...template, kind: kind as 'worker' | 'web' };

  await releaseTemplate(templateForRelease, targetDir, {
    serviceId,
    proxyPath,
    force: opts.force,
  });

  // 兜底:旧版 CLI 生成的 workspace 缺根 database/(子项目 stub 引用它的 README 会悬空)
  const rootDbReadme = path.join(cwd, 'database', 'README.md');
  if (!fs.existsSync(rootDbReadme)) {
    fse.ensureDirSync(path.join(cwd, 'database'));
    fse.writeFileSync(rootDbReadme, generateDatabaseReadme());
    console.log(k.green('  ✓ ') + 'database/README.md(补齐 workspace 根 SQL 约定说明)');
  }

  console.log(k.green('\n✓ service 追加完成!\n'));
}

/**
 * 扫描 workspace 下所有一级子目录的 project.manifest.toml,
 * 提取已有的 service_id 和 proxy.path。
 */
function scanExistingServices(workspaceRoot: string): ExistingService[] {
  const results: ExistingService[] = [];
  const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(workspaceRoot, entry.name, 'project.manifest.toml');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = parse(fs.readFileSync(manifestPath, 'utf-8'));
      const project = manifest.project;
      const proxy = manifest.proxy;
      const serviceId = project && typeof project === 'object' && 'service_id' in project
        ? project.service_id : undefined;
      const proxyPath = proxy && typeof proxy === 'object' && 'path' in proxy
        ? proxy.path : undefined;
      if (typeof serviceId !== 'string' || validateServiceId(serviceId)) {
        throw new Error('Invalid or missing [project].service_id');
      }
      if (proxy !== undefined && (typeof proxyPath !== 'string' || validateProxyPath(proxyPath))) {
        throw new Error('Invalid or missing [proxy].path');
      }
      results.push({
        serviceId,
        proxyPath: typeof proxyPath === 'string' ? proxyPath : undefined,
        directory: entry.name,
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Cannot scan existing service ${manifestPath}: ${detail}`, { cause });
    }
  }
  return results;
}

/**
 * add 命令 —— 往现有 workspace 追加 service。
 *
 * 用法:
 *   create-userapp add <template-id> [--service-id <id>] [--path <path>] [--force]
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

import { getTemplate, type TemplateMeta } from '../templates.js';
import { checkConflicts, validateServiceId, type ExistingService } from '../validate.js';
import { releaseTemplate } from './release.js';

export interface AddOptions {
  serviceId?: string;
  path?: string;
  force?: boolean;
  /** 覆盖 kind: web(默认) / worker(后台任务,不监听 HTTP,不声明 proxy) */
  kind?: 'web' | 'worker';
}

export function registerAddCommand(program: Command): void {
  program
    .command('add <template-id>')
    .description('往当前 workspace 追加一个 service')
    .option('--service-id <id>', '覆盖默认 service_id')
    .option('--path <path>', '覆盖默认 proxy.path')
    .option('--kind <kind>', '服务类型: web(默认) / worker(后台任务,不声明 proxy)')
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
  const kind = opts.kind || 'web';
  const isWorker = kind === 'worker';

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

  // worker 覆盖模板的 kind 字段(用于 manifest 生成)
  const templateForRelease = isWorker ? { ...template, kind: 'worker' as const } : template;

  await releaseTemplate(templateForRelease, targetDir, {
    serviceId,
    proxyPath,
    force: opts.force,
  });

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

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const serviceId = extractTomlValue(content, 'service_id');
    const proxyPath = extractTomlValue(content, 'path');
    if (serviceId) {
      results.push({
        serviceId,
        proxyPath,
        directory: entry.name,
      });
    }
  }
  return results;
}

/** 简易 TOML 值提取(只处理 key = "value" 形式,够用) */
function extractTomlValue(content: string, key: string): string | undefined {
  const re = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm');
  const m = content.match(re);
  return m?.[1];
}

/**
 * init 命令 —— 新建 workspace。
 *
 * 用法:
 *   create-userapp init <dir> [--backend <lang>] [--frontend <lang>] [--next]
 *
 * 流程:
 *  1. 创建目标目录
 *  2. 解析要安装的模板列表
 *  3. 校验组合无冲突
 *  4. 生成 workspace.manifest.toml
 *  5. 释放各模板到子目录 + 参数化
 */

import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';
import type { Command } from 'commander';
import * as k from 'kolorist';

import { TEMPLATES, getTemplate, resolveByAlias, type TemplateMeta } from '../templates.js';
import { generateProjectManifest, generateWorkspaceManifest, generateAgentsMd } from '../manifest.js';
import { checkConflicts } from '../validate.js';
import { releaseTemplate } from './release.js';

export interface InitOptions {
  backend?: string;
  frontend?: string;
  next?: boolean;
  serviceId?: string;
  /** commander --path 映射到此字段 */
  path?: string;
  force?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init <dir>')
    .description('新建 workspace,组合前后端模板')
    .option('--backend <lang>', '后端语言: go / java / python / rust')
    .option('--frontend <lang>', '前端框架: react / vue')
    .option('--next', '使用 Next.js 全栈单体(独占 /)')
    .option('--service-id <id>', '覆盖默认 service_id(仅单模板时有效)')
    .option('--path <path>', '覆盖默认 proxy.path(仅单模板时有效)')
    .option('--force', '覆盖已存在的目录')
    .action(async (dir: string, opts: InitOptions) => {
      await runInit(dir, opts);
    });
}

async function runInit(targetDir: string, opts: InitOptions): Promise<void> {
  // 解析模板组合
  const templates = resolveTemplates(opts);
  if (templates.length === 0) {
    console.error(k.red('✗ ') + '未选择任何模板。请用 --backend / --frontend / --next 指定,或用 list 查看可用模板。');
    process.exit(1);
  }

  // 解析为安装计划(带各自的 serviceId / proxyPath)
  const plan = buildPlan(templates, opts);

  // 多模板时做两两校验
  const allConflicts = checkAllConflicts(plan);
  if (!allConflicts.ok) {
    console.error(k.red('✗ ') + '组合校验失败:');
    for (const e of allConflicts.errors) {
      console.error(k.red('  • ') + e);
    }
    process.exit(1);
  }

  const absTarget = path.resolve(targetDir);

  // 目录存在性检查
  if (fs.existsSync(absTarget)) {
    if (!opts.force && fs.readdirSync(absTarget).length > 0) {
      console.error(k.red(`✗ 目录已存在且非空: ${absTarget}`));
      console.error(k.gray('  用 --force 覆盖。'));
      process.exit(1);
    }
  }

  console.log(k.cyan('▶ 创建 workspace: ') + k.bold(absTarget));

  // 生成 workspace.manifest.toml
  const wsName = path.basename(absTarget);
  fse.ensureDirSync(absTarget);
  const wsContent = generateWorkspaceManifest(wsName, `${wsName} workspace`);
  fse.writeFileSync(path.join(absTarget, 'workspace.manifest.toml'), wsContent);
  console.log(k.green('  ✓ ') + 'workspace.manifest.toml');

  // 释放各模板
  for (const item of plan) {
    console.log(k.cyan(`\n▶ 安装 ${item.template.name} → ${item.dirName}/`));
    await releaseTemplate(item.template, path.join(absTarget, item.dirName), {
      serviceId: item.serviceId,
      proxyPath: item.proxyPath,
      force: opts.force,
    });
  }

  // 生成 AGENTS.md(让 Agent 知道项目结构 + 怎么装 skills)
  const servicesInfo = plan.map((p) => ({
    name: p.template.name,
    dir: p.dirName,
    type: p.template.type,
  }));
  const agentsContent = generateAgentsMd(wsName, servicesInfo);
  fse.writeFileSync(path.join(absTarget, 'AGENTS.md'), agentsContent);
  console.log(k.green('  ✓ ') + 'AGENTS.md');

  // 输出下一步提示
  console.log(k.green('\n✓ workspace 创建完成!\n'));
  console.log(k.bold('下一步:'));
  console.log(`  cd ${targetDir}`);
  console.log(k.cyan('\n  1. 安装 AI skills(推荐):'));
  console.log(k.gray('     npx skills add nuwax-ai/userapp-workspace-template'));
  console.log(k.cyan('\n  2. 检查各子目录的 project.manifest.toml'));
  console.log(k.cyan('\n  3. 用 add 命令追加更多 service:'));
  console.log(k.gray('     npx @nuwax-ai/template-cli add <template-id>'));
  console.log(k.cyan('\n  4. 查看开发者文档:'));
  console.log(k.gray('     npx @nuwax-ai/template-cli docs'));
}

/* ── 内部:解析模板组合 ─────────────────────────────────── */

interface PlanItem {
  template: TemplateMeta;
  dirName: string;
  serviceId: string;
  proxyPath: string;
}

function resolveTemplates(opts: InitOptions): TemplateMeta[] {
  const list: TemplateMeta[] = [];

  if (opts.next) {
    if (opts.backend || opts.frontend) {
      console.error(k.red('✗ --next 不能和 --backend / --frontend 同时使用'));
      console.error(k.gray('  Next.js 是全栈单体,独占 / 路由,不和前后端组合。'));
      process.exit(1);
    }
    list.push(getTemplate('userapp-next')!);
    return list;
  }

  if (opts.backend) {
    const t = resolveByAlias(opts.backend);
    if (!t || t.category !== 'backend') {
      console.error(k.red(`✗ 未知后端: "${opts.backend}"。可选: go / java / python / rust`));
      process.exit(1);
    }
    list.push(t);
  }

  if (opts.frontend) {
    const t = resolveByAlias(opts.frontend);
    if (!t || t.category !== 'frontend') {
      console.error(k.red(`✗ 未知前端: "${opts.frontend}"。可选: react / vue`));
      process.exit(1);
    }
    list.push(t);
  }

  return list;
}

function buildPlan(templates: TemplateMeta[], opts: InitOptions): PlanItem[] {
  // --service-id / --path 仅在单模板场景有意义
  if ((opts.serviceId || opts.path) && templates.length > 1) {
    console.error(k.red('✗ --service-id / --path 只能在单个模板时使用'));
    console.error(k.gray('  多模板组合时,各模板用各自的默认 service_id 和 path。'));
    console.error(k.gray('  如需自定义,请先 init 再用 add 命令单独指定。'));
    process.exit(1);
  }

  return templates.map((template) => ({
    template,
    dirName: opts.serviceId && templates.length === 1 ? opts.serviceId : template.id,
    serviceId: opts.serviceId && templates.length === 1 ? opts.serviceId : template.defaults.serviceId,
    proxyPath: opts.path && templates.length === 1 ? opts.path! : template.defaults.proxyPath,
  }));
}

function checkAllConflicts(plan: PlanItem[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  // 收集所有 service
  const all = plan.map((p) => ({
    serviceId: p.serviceId,
    proxyPath: p.proxyPath,
    directory: p.dirName,
  }));
  // 两两检查
  for (let i = 0; i < all.length; i++) {
    const rest = all.filter((_, j) => j !== i);
    const r = checkConflicts(all[i].serviceId, all[i].proxyPath, rest);
    errors.push(...r.errors);
  }
  // 去重(两两检查会重复报)
  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}

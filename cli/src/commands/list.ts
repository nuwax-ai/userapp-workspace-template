/**
 * list 命令 —— 列出所有可用模板。
 *
 * 用法:
 *   template-cli list                 # 全部
 *   template-cli list backend         # 只看后端(位置参数)
 *   template-cli list --category frontend
 */

import type { Command } from 'commander';
import * as k from 'kolorist';

import { TEMPLATES, listByCategory, type TemplateCategory } from '../templates.js';

export interface ListOptions {
  category?: string;
}

const VALID_CATEGORIES: TemplateCategory[] = ['backend', 'frontend', 'fullstack'];

export function registerListCommand(program: Command): void {
  program
    .command('list [category]')
    .description('列出所有可用模板(可按分类过滤: backend / frontend / fullstack)')
    .option('--category <cat>', '按分类过滤: backend / frontend / fullstack(等价于位置参数)')
    .action((category: string | undefined, opts: ListOptions) => {
      // 位置参数与 --category 同时给出且不一致时,显式报错而不是静默任选其一
      if (category && opts.category && category !== opts.category) {
        console.error(
          k.red(`✗ 分类参数不一致: 位置参数 "${category}" ≠ --category "${opts.category}"`),
        );
        process.exit(1);
      }
      const filter = category ?? opts.category;
      if (filter && !VALID_CATEGORIES.includes(filter as TemplateCategory)) {
        console.error(k.red(`✗ 未知分类: "${filter}"。可选: ${VALID_CATEGORIES.join(' / ')}`));
        process.exit(1);
      }
      runList(filter);
    });
}

function runList(category?: string): void {
  const templates = category
    ? listByCategory(category as TemplateCategory)
    : TEMPLATES;

  if (templates.length === 0) {
    console.log(k.yellow('未找到匹配的模板。'));
    return;
  }

  const grouped = {
    backend: templates.filter((t) => t.category === 'backend'),
    frontend: templates.filter((t) => t.category === 'frontend'),
    fullstack: templates.filter((t) => t.category === 'fullstack'),
  };

  const labels: Record<string, string> = {
    backend: '后端',
    frontend: '前端 SPA',
    fullstack: '全栈单体',
  };

  for (const cat of ['backend', 'frontend', 'fullstack'] as TemplateCategory[]) {
    const items = grouped[cat];
    if (items.length === 0) continue;

    console.log(k.bold(k.cyan(`\n${labels[cat]} (${items.length})`)));
    for (const t of items) {
      console.log(
        `  ${k.green(t.id.padEnd(24))} ${k.gray(t.framework.padEnd(14))} ${t.description}`,
      );
      console.log(
        k.gray(
          `  ${' '.repeat(24)} 默认: service_id=${t.defaults.serviceId}, path=${t.defaults.proxyPath}`,
        ),
      );
    }
  }

  console.log(k.bold('\n用法:'));
  console.log(k.gray('  template-cli list backend          # 只看后端模板'));
  console.log(k.gray('  template-cli list frontend         # 只看前端模板'));
  console.log(k.gray('  template-cli init <dir> --backend go --frontend react'));
  console.log(k.gray('  template-cli add backend-rust'));
  console.log(k.gray('  template-cli init <dir> --next'));
}

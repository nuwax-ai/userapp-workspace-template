/**
 * list 命令 —— 列出所有可用模板。
 *
 * 用法:
 *   create-userapp list
 *   create-userapp list --category backend
 */

import type { Command } from 'commander';
import * as k from 'kolorist';

import { TEMPLATES, listByCategory, type TemplateCategory } from '../templates.js';

export interface ListOptions {
  category?: string;
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('列出所有可用模板')
    .option('--category <cat>', '按分类过滤: backend / frontend / fullstack')
    .action((opts: ListOptions) => {
      runList(opts);
    });
}

function runList(opts: ListOptions): void {
  const templates = opts.category
    ? listByCategory(opts.category as TemplateCategory)
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
  console.log(k.gray('  create-userapp init <dir> --backend go --frontend react'));
  console.log(k.gray('  create-userapp add backend-rust'));
  console.log(k.gray('  create-userapp init <dir> --next'));
}

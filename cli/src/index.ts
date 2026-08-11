#!/usr/bin/env node
/**
 * @nuwax-ai/cli 入口
 *
 * UserApp workspace 模板脚手架。
 * 按需组合多语言前后端模板,生成可发布的 workspace 结构。
 *
 * 用法:
 *   create-userapp init <dir> --backend go --frontend react
 *   create-userapp add backend-rust
 *   create-userapp list
 */

import { Command } from 'commander';
import * as k from 'kolorist';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { registerInitCommand } from './commands/init.js';
import { registerAddCommand } from './commands/add.js';
import { registerListCommand } from './commands/list.js';

// 读取 package.json 版本(ESM 里不能用 require)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('create-userapp')
  .description('UserApp workspace 模板脚手架 — 按需组合多语言前后端模板')
  .version(pkg.version);

// 注册子命令
registerListCommand(program);
registerInitCommand(program);
registerAddCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(k.red('✗ '), err.message || err);
  process.exit(1);
});

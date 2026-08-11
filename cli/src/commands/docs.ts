/**
 * docs 命令 —— 打开或打印随 CLI 分发的开发者文档路径。
 *
 * 用法:
 *   create-userapp docs           # 打印文档目录路径
 *   create-userapp docs --open    # 尝试用系统默认程序打开(macOS: open)
 */

import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import * as k from 'kolorist';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerDocsCommand(program: Command): void {
  program
    .command('docs')
    .description('查看 UserApp 开发者文档')
    .option('--open', '用系统默认程序打开文档目录')
    .action((opts: { open?: boolean }) => {
      // 定位 docs 目录(dist 同级)
      const candidates = [
        path.resolve(__dirname, '..', 'docs'),
        path.resolve(__dirname, '..', '..', 'docs'),
      ];
      const docsDir = candidates.find((d) => fs.existsSync(d));

      if (!docsDir) {
        console.error(k.red('✗ 找不到文档目录。'));
        console.error(k.gray('  如果是开发模式,docs 在仓库根;'));
        console.error(k.gray('  如果是 npm 安装,docs 随包分发在 node_modules/@nuwax-ai/cli/docs/'));
        process.exit(1);
      }

      const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md')).sort();

      console.log(k.bold(k.cyan('\n📖 UserApp 开发者文档\n')));
      console.log(`  目录: ${docsDir}\n`);
      for (const f of files) {
        const title = extractTitle(path.join(docsDir, f));
        console.log(`  ${k.green(f.padEnd(28))} ${title}`);
      }
      console.log(k.gray('\n  用 markdown 阅读器打开上述文件,或从 README.md 开始。\n'));

      if (opts.open) {
        try {
          const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
          execSync(`${cmd} "${docsDir}"`, { stdio: 'ignore' });
          console.log(k.green(`✓ 已打开: ${docsDir}`));
        } catch {
          console.warn(k.yellow(`⚠ 无法自动打开,请手动访问: ${docsDir}`));
        }
      }
    });
}

/** 从 markdown 文件提取第一行标题 */
function extractTitle(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

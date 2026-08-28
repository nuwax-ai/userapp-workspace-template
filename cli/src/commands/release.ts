/**
 * 模板释放逻辑 —— init 和 add 共用。
 *
 * 从已打包的 templates/<id>/ 目录拷贝文件到目标目录,
 * 做占位符替换,然后重新生成 project.manifest.toml。
 *
 * 模板目录定位优先级:
 *  1. CLI 包内的 templates/(npm publish 时随包)—— 生产路径
 *  2. 开发模式:cli/templates/(本地 pack 后)—— 开发路径
 */

import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';
import { fileURLToPath } from 'node:url';
import * as k from 'kolorist';

import type { TemplateMeta } from '../templates.js';
import { generateProjectManifest } from '../manifest.js';
import { buildReplaceMap, renderString, isTextFile } from '../render.js';

// ESM 下没有 __dirname,手动构造
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ReleaseOptions {
  serviceId: string;
  proxyPath: string;
  force?: boolean;
}

/** 定位打包后的模板源目录 */
function findTemplateSourceDir(templateId: string): string {
  const candidates = [
    // 生产/开发:dist 同级的 templates/(npm publish 或 npm run pack 后都在这里)
    path.resolve(__dirname, '..', 'templates', templateId),
    // 兜底:再往上一级(以防从其他位置调用)
    path.resolve(__dirname, '..', '..', 'templates', templateId),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  console.error(k.red(`✗ 找不到模板源目录: templates/${templateId}/`));
  console.error(k.gray(`  搜索过: ${candidates.join(', ')}`));
  console.error(k.gray('  如果是开发模式,请先运行: npm run pack'));
  process.exit(1);
}

/**
 * 释放一个模板到目标目录。
 *
 * 步骤:
 *  1. 找到打包后的模板源目录
 *  2. 遍历所有文件,文本文件做占位符替换,二进制文件直接拷贝
 *  3. 跳过 project.manifest.toml(由生成器重新生成)
 *  4. 重新生成 project.manifest.toml
 */
export async function releaseTemplate(
  template: TemplateMeta,
  targetDir: string,
  opts: ReleaseOptions,
): Promise<void> {
  const sourceDir = findTemplateSourceDir(template.id);
  const replaceMap = buildReplaceMap({
    serviceId: opts.serviceId,
    templateVariables: template.variables,
    isCustomServiceId: opts.serviceId !== template.defaults.serviceId,
    proxyPath: opts.proxyPath,
  });

  // 清空/创建目标目录
  if (opts.force && fs.existsSync(targetDir)) {
    fse.removeSync(targetDir);
  }
  fse.ensureDirSync(targetDir);

  // 遍历模板源,逐文件释放
  walkAndRelease(sourceDir, targetDir, template.id, replaceMap);

  // 重新生成 project.manifest.toml
  const manifestContent = generateProjectManifest({
    template,
    serviceId: opts.serviceId,
    proxyPath: opts.proxyPath,
  });
  fse.writeFileSync(path.join(targetDir, 'project.manifest.toml'), manifestContent);
  console.log(k.green('  ✓ ') + 'project.manifest.toml');
}

function walkAndRelease(
  srcDir: string,
  destDir: string,
  templateId: string,
  replaceMap: Map<string, string>,
): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    // 跳过 manifest(由生成器产出)
    if (entry.name === 'project.manifest.toml') continue;

    if (entry.isDirectory()) {
      // 递归
      fse.ensureDirSync(destPath);
      walkAndRelease(srcPath, destPath, templateId, replaceMap);
    } else if (entry.isFile()) {
      if (isTextFile(entry.name)) {
        const content = fs.readFileSync(srcPath, 'utf-8');
        const rendered = renderString(content, replaceMap);
        fse.writeFileSync(destPath, rendered);
      } else {
        fse.copyFileSync(srcPath, destPath);
      }
    }
  }
}

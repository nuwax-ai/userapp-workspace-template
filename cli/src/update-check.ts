/**
 * 轻量更新检查 —— 不加额外依赖,用 Node 18+ 内置 fetch 查 npm registry。
 *
 * 策略:
 *  - 每天(24h)最多查一次,结果缓存到 ~/.userapp-cli-update.json
 *  - 有新版时启动时打印一行提示,不打断流程
 *  - 查询失败静默跳过(不影响 CLI 正常使用)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(os.homedir(), '.userapp-cli-update.json');
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24h
const PKG_NAME = '@nuwax-ai/template-cli';

interface Cache {
  lastCheck: number;
  latestVersion?: string;
}

function readCache(): Cache | null {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCache(cache: Cache): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // 缓存写入失败静默跳过
  }
}

function getCurrentVersion(): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'),
  );
  return pkg.version;
}

/**
 * 比较两个 semver 版本,返回是否有更新。
 * 简化版:只比 x.y.z,忽略 prerelease 后缀。
 */
function hasUpdate(current: string, latest: string): boolean {
  const parseVer = (v: string) =>
    v.replace(/-.*$/, '').split('.').map((n) => parseInt(n, 10));
  const [c1, c2, c3] = parseVer(current);
  const [l1, l2, l3] = parseVer(latest);
  if (l1 !== c1) return l1 > c1;
  if (l2 !== c2) return l2 > c2;
  return l3 > c3;
}

/**
 * 检查更新(异步,不阻塞)。有新版时打印提示。
 * CI 环境跳过(避免不必要的网络请求)。
 */
export async function checkUpdate(): Promise<void> {
  // CI 环境跳过(GITHUB_ACTIONS / CI 变量)
  if (process.env.CI || process.env.GITHUB_ACTIONS) return;

  const cache = readCache();
  const now = Date.now();

  // 24h 内查过,且缓存有结果 → 直接用缓存
  if (cache && cache.lastCheck && now - cache.lastCheck < CHECK_INTERVAL && cache.latestVersion) {
    const current = getCurrentVersion();
    if (hasUpdate(current, cache.latestVersion)) {
      printNotice(current, cache.latestVersion);
    }
    return;
  }

  // 异步查 npm registry(不阻塞主流程)
  try {
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    if (!data.version) return;

    writeCache({ lastCheck: now, latestVersion: data.version });

    const current = getCurrentVersion();
    if (hasUpdate(current, data.version)) {
      printNotice(current, data.version);
    }
  } catch {
    // 网络失败/超时静默跳过
  }
}

function printNotice(current: string, latest: string): void {
  // eslint-disable-next-line no-console
  console.log(
    `\x1b[36mℹ\x1b[0m ${PKG_NAME} 有新版本: \x1b[1m${latest}\x1b[0m (当前 ${current}),` +
      ` 运行 \x1b[2mnpm install -g ${PKG_NAME}\x1b[0m 更新\n`,
  );
}

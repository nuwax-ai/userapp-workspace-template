/** Install the selected package manager's existing lock without resolving new versions. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function selectManager(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const locks = { npm: existsSync(path.join(root, 'package-lock.json')), pnpm: existsSync(path.join(root, 'pnpm-lock.yaml')) };
  let manager;
  let version;
  if (manifest.packageManager !== undefined) {
    if (typeof manifest.packageManager !== 'string') throw new Error('packageManager must name npm or pnpm with an exact version');
    const match = /^(npm|pnpm)@(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:\+[^\s]+)?$/.exec(manifest.packageManager);
    if (!match) throw new Error(`Unsupported packageManager: ${manifest.packageManager}; use installed npm or pnpm with an exact version`);
    [, manager, version] = match;
  } else {
    const available = Object.keys(locks).filter(name => locks[name]);
    if (available.length > 1) throw new Error('Both package-lock.json and pnpm-lock.yaml exist; set packageManager explicitly to select one');
    manager = available[0] || 'pnpm'; // Preserve the template's explicit first-build initialization contract.
  }
  if (!locks[manager] && Object.values(locks).some(Boolean)) throw new Error(`${manager} selected but ${manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'} is missing; no package-manager fallback is allowed`);
  const initializesLock = !locks[manager];
  return { manager, version, initializesLock, installArgs: initializesLock ? ['install'] : manager === 'npm' ? ['ci'] : ['install', '--frozen-lockfile'] };
}

export function installLocked(root) {
  const selected = selectManager(root);
  // Package-manager selection must not download a new manager or rewrite package.json.
  // Dependency downloads still follow the selected, existing lockfile.
  const env = { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_DEFAULT_TO_LATEST: '0' };
  if (selected.version) {
    const actual = execFileSync(selected.manager, ['--version'], { cwd: root, env, encoding: 'utf8' }).trim();
    if (actual !== selected.version) throw new Error(`packageManager requires ${selected.manager}@${selected.version}, but installed version is ${actual}; use the matching installed tool`);
  }
  const lockName = selected.manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml';
  const lockPath = path.join(root, lockName);
  const digest = () => createHash('sha256').update(readFileSync(lockPath)).digest('hex');
  if (selected.initializesLock) {
    console.log(`[dependencies] no lockfile input; initializing ${lockName} with ${selected.manager} install (first-build template contract)`);
  } else {
    console.log(`[dependencies] ${lockName} input sha256=${digest()}; running ${selected.manager} ${selected.installArgs.join(' ')}`);
  }
  execFileSync(selected.manager, selected.installArgs, { cwd: root, env, stdio: 'inherit' });
  if (!existsSync(lockPath)) throw new Error(`${selected.manager} install succeeded without producing ${lockName}`);
  console.log(`[dependencies] ${lockName} output sha256=${digest()}; subsequent builds reuse this lock`);
  return selected.manager;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length) throw new Error('Usage: node scripts/install-locked.mjs');
    installLocked(process.cwd());
  } catch (error) {
    console.error(`Locked dependency installation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

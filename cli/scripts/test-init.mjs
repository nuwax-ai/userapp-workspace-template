#!/usr/bin/env node
/** init 真 CLI 回归：只在临时目录操作，不执行项目构建或管理启停。 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(cliDir, 'dist', 'index.js');

function init(target, cwd, extra = []) {
  const result = spawnSync(process.execPath,
    [cli, 'init', target, '--backend', 'python', '--frontend', 'react', ...extra],
    { cwd, encoding: 'utf8', env: { ...process.env, CI: '1' }, timeout: 10000 });
  assert.ifError(result.error);
  return result;
}

function snapshot(directory) {
  const entries = {};
  function visit(relative) {
    const absolute = path.join(directory, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) entries[relative] = ['link', fs.readlinkSync(absolute)];
    else if (stat.isDirectory()) {
      entries[relative] = ['directory'];
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else entries[relative] = ['file', fs.readFileSync(absolute).toString('base64')];
  }
  visit('');
  return entries;
}

function withDirectory(name, work) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `template-init-${name}-`));
  try { work(temporary); }
  finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

function rejectedWithoutChanges(directory, extra = []) {
  const before = snapshot(directory);
  const result = init('.', directory, extra);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /导入指引|增量适配/);
  assert.deepEqual(snapshot(directory), before, '拒绝必须发生在任何写入之前');
  return result;
}

test('平台元数据根 init . 成功，保留原件，服务与 manifest 留在根', () => {
  withDirectory('metadata', (root) => {
    for (const directory of ['.git', '.agents', '.claude', '.codex', '.opencode',
      '.grok', '.pi', '.agent-store', '.tmp', '.logs', 'state']) {
      fs.mkdirSync(path.join(root, directory));
      fs.writeFileSync(path.join(root, directory, 'sentinel'), `preserve ${directory}\n`);
    }
    fs.mkdirSync(path.join(root, '.agents', 'skills'));
    fs.symlinkSync('../.agents/skills', path.join(root, '.claude', 'skills'));
    for (const directory of ['code', 'builds', '.run']) {
      fs.mkdirSync(path.join(root, directory));
    }
    for (const file of ['AGENTS.md', 'CLAUDE.md', 'README.md', '.gitignore', '.npmrc', '.mcp.json',
      '.deploy-prepare.lock', '.deploy-state.toml', '.deploy-operation.lock', '.deploy-operation.json',
      '.deploy-coordinator.json', '.deploy-requests.json']) {
      fs.writeFileSync(path.join(root, file), `# preserve ${file}\ncustom-rule/\n`);
    }
    const before = snapshot(root);
    const result = init('.', root);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const after = snapshot(root);
    for (const [file, value] of Object.entries(before)) {
      if (file === '.gitignore') {
        assert.ok(fs.readFileSync(path.join(root, file), 'utf8').startsWith('# preserve .gitignore\ncustom-rule/\n'));
      } else assert.deepEqual(after[file], value, `原件必须保留: ${file}`);
    }
    assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('/release.lock.toml'));
    for (const file of ['workspace.manifest.toml', 'backend-python/project.manifest.toml',
      'frontend-react-vite/project.manifest.toml', 'database/README.md']) {
      assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
    }
    assert.deepEqual(fs.readdirSync(path.join(root, 'code')), [], '不能在 code 内新建 workspace');
  });
});

test('独立客户端可在普通空目录或新目录初始化', () => {
  withDirectory('empty', (root) => {
    fs.mkdirSync(path.join(root, 'empty'));
    fs.mkdirSync(path.join(root, 'git-worktree'));
    fs.writeFileSync(path.join(root, 'git-worktree', '.git'), 'gitdir: ../existing-git-worktree\n');
    fs.writeFileSync(path.join(root, 'user-AGENTS.md'), 'preserve user instructions');
    fs.writeFileSync(path.join(root, 'user-CLAUDE.md'), 'preserve Claude instructions');
    fs.symlinkSync('../user-AGENTS.md', path.join(root, 'git-worktree', 'AGENTS.md'));
    fs.symlinkSync('../user-CLAUDE.md', path.join(root, 'git-worktree', 'CLAUDE.md'));
    const beforeGitRoot = snapshot(path.join(root, 'git-worktree'));
    for (const name of ['empty', 'new', 'git-worktree']) {
      const result = init(name, root);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.ok(fs.existsSync(path.join(root, name, 'workspace.manifest.toml')));
      assert.ok(fs.existsSync(path.join(root, name, 'AGENTS.md')));
    }
    const afterGitRoot = snapshot(path.join(root, 'git-worktree'));
    for (const [name, value] of Object.entries(beforeGitRoot)) assert.deepEqual(afterGitRoot[name], value);
    assert.equal(fs.readFileSync(path.join(root, 'user-AGENTS.md'), 'utf8'), 'preserve user instructions');
    assert.equal(fs.readFileSync(path.join(root, 'user-CLAUDE.md'), 'utf8'), 'preserve Claude instructions');
  });
});

test('默认 init 拒绝业务、已有 workspace 与生成目标冲突，并保留原件', () => {
  const fixtures = {
    business(root) { fs.writeFileSync(path.join(root, 'package.json'), '{"name":"existing-business"}'); },
    workspace(root) { fs.writeFileSync(path.join(root, 'workspace.manifest.toml'), 'preserve workspace'); },
    nested(root) {
      fs.mkdirSync(path.join(root, 'code'));
      fs.writeFileSync(path.join(root, 'code', 'workspace.manifest.toml'), 'preserve nested workspace');
    },
    builds(root) {
      fs.mkdirSync(path.join(root, 'builds'));
      fs.writeFileSync(path.join(root, 'builds', 'artifact.zip'), 'preserve artifact');
    },
    activated(root) {
      fs.mkdirSync(path.join(root, '.run'));
      fs.writeFileSync(path.join(root, '.run', 'workspace.manifest.toml'), 'preserve activated workspace');
    },
    template(root) { fs.mkdirSync(path.join(root, 'frontend-react-vite')); },
    index(root) { fs.writeFileSync(path.join(root, 'index.html'), '<h1>existing business</h1>'); },
    database(root) {
      fs.mkdirSync(path.join(root, 'database'));
      fs.writeFileSync(path.join(root, 'database', 'README.md'), 'preserve SQL guide');
    },
    wrongMetadataType(root) { fs.writeFileSync(path.join(root, '.agents'), 'not a metadata directory'); },
  };
  for (const [name, fixture] of Object.entries(fixtures)) {
    withDirectory(name, (root) => {
      fixture(root);
      rejectedWithoutChanges(root);
    });
  }
});

test('CLI 模板目录与根 SQL 目录碰撞在创建目标前拒绝', () => {
  withDirectory('plan-conflict', (root) => {
    const before = snapshot(root);
    const result = spawnSync(process.execPath,
      [cli, 'init', 'new-workspace', '--frontend', 'react', '--service-id', 'database'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1' }, timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CLI 模板目录与 workspace 根 SQL 目录冲突/);
    assert.deepEqual(snapshot(root), before, '计划内冲突不能创建目录或留下生成文件');
  });
});

test('将要写入的目标 symlink 不能越界写入，非法 service-id 写入前失败', () => {
  withDirectory('links', (temporary) => {
    const outside = path.join(temporary, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'preserve external');
    const beforeOutside = snapshot(outside);
    for (const name of ['.gitignore', 'frontend-react-vite']) {
      const root = path.join(temporary, name.replaceAll('.', '_'));
      fs.mkdirSync(root);
      fs.symlinkSync(name === '.gitignore'
        ? path.join(outside, 'sentinel') : outside, path.join(root, name));
      const result = rejectedWithoutChanges(root);
      assert.match(result.stderr, /符号链接|symlink/);
      assert.deepEqual(snapshot(outside), beforeOutside);
    }
    const root = path.join(temporary, 'invalid-id');
    fs.mkdirSync(root);
    const before = snapshot(root);
    const result = spawnSync(process.execPath,
      [cli, 'init', '.', '--frontend', 'react', '--service-id', '../outside'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1' }, timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /service_id/);
    assert.deepEqual(snapshot(root), before);
    assert.deepEqual(snapshot(outside), beforeOutside);
  });
});

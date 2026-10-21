/**
 * pack-templates.mjs —— 把模板源目录转换成参数化模板,打包进 CLI 包。
 *
 * 流程:
 *  1. 遍历模板映射表中的源目录(从仓库根的 ../backend-go 等)
 *  2. 过滤掉产物文件(node_modules/target/deps/artifact.zip/logs/dist/.next 等)
 *  3. 对文本文件做"占位符注入":把硬编码值替换成 __PLACEHOLDER__
 *  4. 删除 project.manifest.toml(运行时由 manifest 生成器产出)
 *  5. 输出到 cli/templates/<id>/
 *
 * 占位符注入规则定义在 PLACEHOLDER_RULES 里。
 * 每条规则是 { from: "硬编码值", to: "占位符名" },pack 会自动把 to 包成 __TO__。
 *
 * 运行: npm run pack
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_OUT = path.join(CLI_ROOT, 'templates');

/* ── 模板源目录 → 模板 id 映射 ──────────────────────────── */
const TEMPLATE_SOURCES = {
  'backend-go': 'backend-go',
  'backend-java': 'backend-java',
  'backend-python': 'backend-python',
  'worker-python': 'worker-python',
  'backend-rust': 'backend-rust',
  'frontend-react-vite': 'frontend-react-vite',
  'frontend-vue3-vite': 'frontend-vue3-vite',
  'userapp-next-template': 'userapp-next', // 目录名带 -template 后缀,映射到 id
};

/* ── 要过滤掉的产物/无关目录和文件 ──────────────────────── */
const SKIP_DIRS = new Set([
  'node_modules', 'target', 'dist', '.next', 'deps', '__pycache__',
  'logs', '.logs', '.git', '.hg', '.svn', 'out', 'build', 'coverage', '.turbo', '.pip-cache',
  '.cache', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.venv', 'venv',
  '.agents', '.claude', '.codex', '.opencode', '.ssh', '.aws', '.secrets', 'secrets', 'credentials',
  '.run', '.previous', '.staging', '.local-deploy', '.local-logs', 'builds', '.tmp', 'tmp', 'migration-receipts',
]);
const SKIP_FILES = new Set([
  'artifact.zip', 'server', 'app.jar', '.DS_Store',
  'userapp-next-standalone.zip', '.npmrc', '.pypirc', 'id_rsa', 'id_ed25519',
]);
// These names identify generated files, but may also be real source directories
// (Go's cmd/server/). Private/cache rules continue to apply to either kind.
const BUILD_OUTPUT_FILES = new Set(['artifact.zip', 'server', 'app.jar', 'userapp-next-standalone.zip']);
const SKIP_FILE_PATTERNS = [
  /\.pyc$/,
  /\.class$/,
  /\.log$/,
  /\.tsbuildinfo$/,
  /^\.deps-(stamp|build\.lock)/,
  /^\.deploy-/,
  /^\.artifact-.*\.zip$/,
  /\.(key|p12|pfx|tmp|log\.[0-9]+)$/i,
  /^\.env(?!\.(example|sample)$)/i,
];

/* ── 占位符注入规则 ────────────────────────────────────────
 * 每个模板一组规则。key = 相对文件路径(支持 glob *),value = 替换规则数组。
 * { from: 硬编码字符串, to: 占位符名(不含 __) }
 * pack 会把 from 替换成 __TO__。
 *
 * 重要:from 必须是源码里真实存在的精确字符串。
 * 规则越精确(带引号/锚点),误替换风险越低。
 */
const PLACEHOLDER_RULES = {
  'backend-go': {
    'go.mod': [{ from: 'module backend-go', to: 'module __MODULE_NAME__' }],
    '**/*.go': [
      { from: '"backend-go/internal/', to: '"__MODULE_NAME__/internal/' },
      { from: '"backend-go"', to: '"__MODULE_NAME__"' },
    ],
    '**/logging.go': [
      { from: 'getenv("LOG_FILE", "backend-go.log")', to: 'getenv("LOG_FILE", "__LOG_FILE__")' },
      { from: 'LOG_FILE 默认 backend-go.log', to: 'LOG_FILE 默认 __LOG_FILE__' },
    ],
    '**/health.go': [
      { from: '"service": "go"', to: '"service": "__HEALTH_SERVICE_TAG__"' },
    ],
  },

  'backend-java': {
    'pom.xml': [
      { from: '<groupId>com.example</groupId>', to: '<groupId>__GROUP_ID__</groupId>' },
      { from: '<artifactId>backend-java</artifactId>', to: '<artifactId>__ARTIFACT_ID__</artifactId>' },
      { from: 'com.example.backendjava', to: '__JAVA_PACKAGE__' },
    ],
    '**/application.yml': [
      { from: 'pool-name: backend-java-pool', to: 'pool-name: __POOL_NAME__' },
      { from: 'name: backend-java', to: 'name: __SPRING_APP_NAME__' },
      { from: "/backend-java.log", to: "/__LOG_FILE__" },
      { from: "/backend-java}.%d", to: "/__SPRING_APP_NAME__}.%d" },
      { from: 'com.example.backendjava: INFO', to: '__JAVA_PACKAGE__: INFO' },
    ],
    '**/*.java': [
      { from: 'package com.example.backendjava', to: 'package __JAVA_PACKAGE__' },
      { from: 'import com.example.backendjava', to: 'import __JAVA_PACKAGE__' },
      { from: '"com.example.backendjava', to: '"__JAVA_PACKAGE__' },
    ],
    '**/HealthController.java': [
      { from: '"service", "java"', to: '"service", "__HEALTH_SERVICE_TAG__"' },
    ],
  },

  'backend-python': {
    '**/main.py': [
      { from: 'FastAPI(title="backend-python"', to: 'FastAPI(title="__APP_TITLE__"' },
    ],
    '**/logging_setup.py': [
      { from: 'os.environ.get("LOG_FILE", "backend-python.log")', to: 'os.environ.get("LOG_FILE", "__LOG_FILE__")' },
    ],
    '**/middleware.py': [
      { from: 'getLogger("backend-python.access")', to: 'getLogger("__LOGGER_NAME__")' },
    ],
    '**/health.py': [
      { from: '"service": "python"', to: '"service": "__HEALTH_SERVICE_TAG__"' },
    ],
    'main.py': [
      { from: '[python]', to: '[__STARTUP_TAG__]' },
    ],
  },

  'backend-rust': {
    'Cargo.toml': [
      { from: 'name = "backend-rust"', to: 'name = "__CRATE_NAME__"' },
    ],
    '**/config.rs': [
      { from: '"backend-rust".into()', to: '"__LOG_FILE_PREFIX__".into()' },
      { from: '日志文件前缀；默认 backend-rust', to: '日志文件前缀；默认 __LOG_FILE_PREFIX__' },
    ],
    '**/routes.rs': [
      { from: 'title = "backend-rust API"', to: 'title = "__OPENAPI_TITLE__"' },
    ],
    '**/health.rs': [
      { from: 'service: "rust"', to: 'service: "__HEALTH_SERVICE_TAG__"' },
    ],
  },

  'frontend-react-vite': {
    'package.json': [
      { from: '"name": "@nuwax-ai/react-vite"', to: '"name": "__PACKAGE_NAME__"' },
    ],
    '**/index.html': [
      { from: '<title>React Vite App</title>', to: '<title>__HTML_TITLE__</title>' },
    ],
  },

  'frontend-vue3-vite': {
    'package.json': [
      { from: '"name": "@nuwax-ai/vue3-vite"', to: '"name": "__PACKAGE_NAME__"' },
    ],
    '**/index.html': [
      { from: '<title>Vue3 Vite App</title>', to: '<title>__HTML_TITLE__</title>' },
    ],
  },

  'userapp-next': {
    'package.json': [
      { from: '"name": "userapp-next-template"', to: '"name": "__PACKAGE_NAME__"' },
    ],
    '**/build-standalone.mjs': [
      { from: "'userapp-next-standalone.zip'", to: "'__ARTIFACT_NAME__.zip'" },
      { from: 'userapp-next-standalone.zip', to: '__ARTIFACT_NAME__.zip' },
    ],
    '**/layout.tsx': [
      { from: 'title: "UserApp Next.js 模板"', to: 'title: "__METADATA_TITLE__"' },
      { from: 'description: "Next.js 16 + Drizzle ORM + PostgreSQL 一体化 UserApp 模板（运行于 RCoder）"', to: 'description: "__METADATA_DESCRIPTION__"' },
    ],
  },
};

/* ── 文本文件扩展名(需要做占位符替换) ────────────────────── */
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.toml',
  '.md', '.txt', '.yml', '.yaml', '.vue', '.css', '.scss', '.html',
  '.go', '.rs', '.java', '.py', '.xml', '.properties', '.sh',
  '.sql', '.mod', '.sum',
]);
const TEXT_NOEXT = new Set([
  '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc', '.npmrc',
  'Dockerfile', 'Makefile',
]);

function isTextFile(fileName) {
  if (TEXT_NOEXT.has(fileName)) return true;
  const ext = path.extname(fileName).toLowerCase();
  return TEXT_EXTS.has(ext);
}

/* ── glob 简易匹配(支持 * 和 **) ──────────────────────────
 * '**' 前缀匹配零层或多层目录:规则键形如 "**" + "/vite.config.ts" 时,
 * 根目录的 vite.config.ts 和 src/nested/vite.config.ts 都会命中。
 */
function matchGlob(filePath, pattern) {
  // 把 glob 转成正则('**' 连同其后的 '/' 一起替换,避免斜杠重复)
  const re = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '\x00') // 临时占位
    .replace(/\*/g, '[^/]*')
    .replace(/\x00\//g, '(?:.*/)?')
    .replace(/\x00/g, '.*'); // 兜底:不跟 '/' 的 '**'(如 src/**)
  return new RegExp(`^${re}$`).test(filePath);
}

/* ── 主流程 ──────────────────────────────────────────────── */

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.deps-install-');
}

function shouldSkipFile(name) {
  if (SKIP_FILES.has(name)) return true;
  return SKIP_FILE_PATTERNS.some((re) => re.test(name));
}

/**
 * 对文件内容应用占位符注入规则。
 */
function applyPlaceholders(templateId, relPath, content) {
  const rules = PLACEHOLDER_RULES[templateId];
  if (!rules) return content;

  let result = content;
  for (const [glob, replacements] of Object.entries(rules)) {
    if (!matchGlob(relPath, glob)) continue;
    for (const { from, to } of replacements) {
      if (result.includes(from)) {
        result = result.split(from).join(to);
      }
    }
  }
  return result;
}

/** Source collection is read-only and validates links before clearing old output. */
export function collectTemplateFiles(srcDir, baseDir = srcDir, ancestors = new Set()) {
  const boundary = fs.realpathSync(baseDir);
  const real = fs.realpathSync(srcDir);
  const relative = path.relative(boundary, real);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Template symlink escapes source root: ${srcDir}`);
  }
  if (ancestors.has(real)) throw new Error(`Template symlink directory cycle: ${srcDir}`);
  const next = new Set([...ancestors, real]);
  const result = [];
  for (const entry of fs.readdirSync(real, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const skipDirectory = name => shouldSkipDir(name) || (shouldSkipFile(name) && !BUILD_OUTPUT_FILES.has(name));
    if (skipDirectory(entry.name)) continue;
    const source = path.join(srcDir, entry.name);
    const resolved = fs.realpathSync(source);
    const stat = fs.statSync(resolved);
    if (stat.isFile() && shouldSkipFile(entry.name)) continue;
    const canonical = path.relative(boundary, resolved);
    if (canonical.startsWith('..') || path.isAbsolute(canonical)) {
      throw new Error(`Template symlink escapes source root: ${source}`);
    }
    const parts = canonical.split(path.sep);
    if (entry.isSymbolicLink() && parts.some((name, index) => index === parts.length - 1 && stat.isFile()
      ? shouldSkipDir(name) || shouldSkipFile(name) : skipDirectory(name))) {
      throw new Error(`Template symlink targets excluded input: ${source}`);
    }
    if (stat.isDirectory()) {
      result.push(...collectTemplateFiles(source, baseDir, next));
    } else if (stat.isFile()) {
      if (entry.name === 'project.manifest.toml') continue;
      result.push({ source: resolved, relative: path.relative(baseDir, source), mode: stat.mode & 0o777 });
    } else {
      throw new Error(`Template input is not a regular file or directory: ${source}`);
    }
  }
  return result;
}

export function walkAndPack(srcDir, destDir, templateId, baseDir = srcDir) {
  const files = collectTemplateFiles(srcDir, baseDir);
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    // npm uses .gitignore as package filtering; release the renamed copy later.
    const name = path.basename(file.relative);
    const relative = name === '.gitignore'
      ? path.join(path.dirname(file.relative), '_gitignore') : file.relative;
    const destination = path.join(destDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (isTextFile(name)) {
      const content = applyPlaceholders(templateId, file.relative, fs.readFileSync(file.source, 'utf-8'));
      fs.writeFileSync(destination, content);
    } else {
      fs.copyFileSync(file.source, destination);
    }
    fs.chmodSync(destination, file.mode);
  }
}

/** 读取唯一导入正文；在清理任何打包产物之前发现缺失或不可读的源文件。 */
export function readImportGuide(sourcePath) {
  try {
    if (!fs.statSync(sourcePath).isFile()) {
      throw new Error('导入正文路径必须是文件');
    }
    const content = fs.readFileSync(sourcePath);
    if (!content.toString('utf-8').trim()) {
      throw new Error('导入正文不能为空');
    }
    return content;
  } catch (cause) {
    throw new Error(`无法读取导入已有项目正文: ${sourcePath}`, { cause });
  }
}

function packAll() {
  const docsSrc = path.join(REPO_ROOT, 'docs');
  if (!fs.statSync(docsSrc).isDirectory()) {
    throw new Error(`文档源目录不可用: ${docsSrc}`);
  }
  const importGuide = readImportGuide(path.join(
    REPO_ROOT, 'skills', 'userapp-dev-guide', 'references', 'import-existing-project.md',
  ));
  const runtimeHelper = path.join(REPO_ROOT, 'backend-python', 'scripts', 'artifact_pack.py');
  if (!fs.statSync(runtimeHelper).isFile()) throw new Error('Canonical runtime artifact helper is missing');
  for (const sourceDirName of Object.keys(TEMPLATE_SOURCES)) {
    collectTemplateFiles(path.join(REPO_ROOT, sourceDirName));
  }
  console.log('▶ 打包模板到 cli/templates/\n');

  // 清空输出目录
  if (fs.existsSync(TEMPLATES_OUT)) {
    fs.rmSync(TEMPLATES_OUT, { recursive: true });
  }
  fs.mkdirSync(TEMPLATES_OUT, { recursive: true });

  let total = 0;
  for (const [sourceDirName, templateId] of Object.entries(TEMPLATE_SOURCES)) {
    const srcDir = path.join(REPO_ROOT, sourceDirName);
    const destDir = path.join(TEMPLATES_OUT, templateId);

    const beforeCount = countFiles(destDir);
    walkAndPack(srcDir, destDir, templateId, srcDir);
    fs.mkdirSync(path.join(destDir, 'scripts'), { recursive: true });
    fs.copyFileSync(runtimeHelper, path.join(destDir, 'scripts', 'artifact_pack.py'));
    const afterCount = countFiles(destDir);

    console.log(`  ✓ ${templateId.padEnd(24)} (${sourceDirName}/ → templates/${templateId}/, ${afterCount} 文件)`);
    total += afterCount;
  }

  console.log(`\n✓ 打包完成: ${Object.keys(TEMPLATE_SOURCES).length} 个模板, 共 ${total} 文件`);
  console.log(`  输出: ${path.relative(REPO_ROOT, TEMPLATES_OUT)}/`);

  // 额外:拷贝 docs/ 到 cli/docs/(随 npm 包分发)
  const docsDest = path.join(CLI_ROOT, 'docs');
  if (fs.existsSync(docsDest)) fs.rmSync(docsDest, { recursive: true });
  fs.cpSync(docsSrc, docsDest, { recursive: true });
  // 仓库 docs/07 是导航页；npm 分发必须携带正文，不能依赖包外的 skills/ 路径。
  fs.writeFileSync(path.join(docsDest, '07-import-existing-project.md'), importGuide);
  const docCount = countFiles(docsDest);
  console.log(`  ✓ docs/ (${docCount} 篇文档 → cli/docs/)`);
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

// macOS /var -> /private/var 或符号链接启动时，argv 与 import.meta.url 的字面路径不同。
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packAll();
}

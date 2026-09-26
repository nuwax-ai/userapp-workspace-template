/**
 * pack-templates.mjs —— 把模板源目录转换成参数化模板,打包进 CLI 包。
 *
 * 流程:
 *  1. 遍历 7 个模板源目录(从仓库根的 ../backend-go 等)
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
  'logs', '.git', 'out', 'build', 'coverage', '.turbo', '.pip-cache',
]);
const SKIP_FILES = new Set([
  'artifact.zip', 'server', 'app.jar', '.DS_Store',
  'userapp-next-standalone.zip',
]);
const SKIP_FILE_PATTERNS = [
  /\.pyc$/,
  /\.class$/,
  /\.log$/,
  /\.tsbuildinfo$/,
  /^\.deps-(stamp|build\.lock)/,
  /^\.artifact-.*\.zip$/,
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

function walkAndPack(srcDir, destDir, templateId, baseDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      walkAndPack(
        path.join(srcDir, entry.name),
        path.join(destDir, entry.name),
        templateId,
        baseDir,
      );
    } else if (entry.isFile()) {
      if (shouldSkipFile(entry.name)) continue;

      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      const relPath = path.relative(baseDir, srcPath);

      // project.manifest.toml 不打包(运行时由 manifest 生成器产出)
      if (entry.name === 'project.manifest.toml') continue;

      if (isTextFile(entry.name)) {
        let content = fs.readFileSync(srcPath, 'utf-8');
        content = applyPlaceholders(templateId, relPath, content);
        fs.writeFileSync(destPath, content);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function packAll() {
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

    if (!fs.existsSync(srcDir)) {
      console.warn(`  ⚠ 跳过(源目录不存在): ${sourceDirName}`);
      continue;
    }

    const beforeCount = countFiles(destDir);
    walkAndPack(srcDir, destDir, templateId, srcDir);
    const afterCount = countFiles(destDir);

    console.log(`  ✓ ${templateId.padEnd(24)} (${sourceDirName}/ → templates/${templateId}/, ${afterCount} 文件)`);
    total += afterCount;
  }

  console.log(`\n✓ 打包完成: ${Object.keys(TEMPLATE_SOURCES).length} 个模板, 共 ${total} 文件`);
  console.log(`  输出: ${path.relative(REPO_ROOT, TEMPLATES_OUT)}/`);

  // 额外:拷贝 docs/ 到 cli/docs/(随 npm 包分发)
  const docsSrc = path.join(REPO_ROOT, 'docs');
  const docsDest = path.join(CLI_ROOT, 'docs');
  if (fs.existsSync(docsSrc)) {
    if (fs.existsSync(docsDest)) fs.rmSync(docsDest, { recursive: true });
    fs.cpSync(docsSrc, docsDest, { recursive: true });
    const docCount = countFiles(docsDest);
    console.log(`  ✓ docs/ (${docCount} 篇文档 → cli/docs/)`);
  }
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

packAll();

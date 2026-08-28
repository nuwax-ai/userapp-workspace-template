/**
 * 参数化替换引擎。
 *
 * 工作原理:
 *  pack-templates.mjs 把模板源里的硬编码值替换成 __PLACEHOLDER__(双下划线包裹);
 *  render.ts 在用户释放模板时,把占位符替换成用户指定值。
 *
 * 有 4 个特殊占位符不在此替换(由 manifest 生成器单独处理,因为它们影响 TOML 结构):
 *  - __SERVICE_ID__  → 渲染时注入 logGlob 等派生值
 *  - __PROXY_PATH__  → 不进文件,只进 manifest
 *  但为了简单起见,SERVICE_ID 也作为可替换变量在此处理。
 */

import path from 'node:path';

/** 占位符的包裹样式: __NAME__ */
export const PLACEHOLDER_WRAP = (name: string) => `__${name}__`;

export interface RenderContext {
  /** 用户指定的 service_id(可能不同于模板默认值) */
  serviceId: string;
  /** 模板注册表里的 variables(占位符默认值) */
  templateVariables: Record<string, string>;
  /** service_id 是否被用户自定义(不同于模板默认值) */
  isCustomServiceId?: boolean;
  /**
   * 生效的 proxy.path(web 服务;worker 为空)。
   * 用于派生 VITE_BASE 等前端资源基路径,保证自定义路由后静态资源可达。
   */
  proxyPath?: string;
}

/**
 * 构建完整替换表:模板变量 + 派生变量 → 最终值。
 *
 * 当用户自定义了 service_id(不同于模板默认值)时,所有"身份相关"的变量
 * 会从 service_id 派生,而不是用模板默认值。这确保改 service_id 后,
 * 模块名、crate 名、日志文件名等同步变化。
 */
export function buildReplaceMap(ctx: RenderContext): Map<string, string> {
  const map = new Map<string, string>();

  // 先放模板自带变量
  for (const [k, v] of Object.entries(ctx.templateVariables)) {
    map.set(k, v);
  }

  // 派生变量:SERVICE_ID 和 LOG_PREFIX 总是跟随 service_id
  map.set('SERVICE_ID', ctx.serviceId);
  map.set('LOG_PREFIX', ctx.serviceId);

  // 前端资源基路径跟随 proxy.path:'/react' → '/react/';catch-all '/' 保持 '/'
  if (ctx.proxyPath) {
    const trimmed = ctx.proxyPath.replace(/\/+$/, '');
    map.set('VITE_BASE', trimmed === '' ? '/' : `${trimmed}/`);
  }

  // 当 service_id 被自定义(不等于模板默认值)时,身份相关变量从 service_id 派生。
  // 这些变量的模板默认值通常是 <service_id>.log / <service_id> 等,
  // 自定义后应该用新 service_id 替换。
  if (ctx.isCustomServiceId) {
    // 日志相关
    deriveIfExists(map, 'LOG_FILE', `${ctx.serviceId}.log`);
    deriveIfExists(map, 'LOG_FILE_PREFIX', ctx.serviceId);
    // 模块/包名
    deriveIfExists(map, 'MODULE_NAME', ctx.serviceId);
    deriveIfExists(map, 'CRATE_NAME', ctx.serviceId);
    deriveIfExists(map, 'ARTIFACT_ID', ctx.serviceId);
    // 应用名/标题
    deriveIfExists(map, 'APP_TITLE', ctx.serviceId);
    deriveIfExists(map, 'SPRING_APP_NAME', ctx.serviceId);
    deriveIfExists(map, 'OPENAPI_TITLE', `${ctx.serviceId} API`);
    deriveIfExists(map, 'POOL_NAME', `${ctx.serviceId}-pool`);
    // logger 名(如 backend-python.access → my-api.access)
    const loggerName = map.get('LOGGER_NAME');
    if (loggerName) {
      const suffix = loggerName.split('.').slice(1).join('.');
      map.set('LOGGER_NAME', suffix ? `${ctx.serviceId}.${suffix}` : ctx.serviceId);
    }
    // Java 包名:com.example.<dirname> → 保持 com.example.<service_id 去横杠>
    // 这里不动 JAVA_PACKAGE,因为改包名涉及目录 rename,留给用户手动处理
  }

  return map;
}

/** 仅当 map 里已有此 key 时才覆盖派生值 */
function deriveIfExists(map: Map<string, string>, key: string, value: string): void {
  if (map.has(key)) {
    map.set(key, value);
  }
}

/**
 * 把字符串里的 __PLACEHOLDER__ 替换成最终值。
 * 只替换已知的占位符,未知的保留原样(便于排查)。
 */
export function renderString(
  content: string,
  replaceMap: Map<string, string>,
): string {
  let result = content;
  for (const [name, value] of replaceMap) {
    const placeholder = PLACEHOLDER_WRAP(name);
    if (result.includes(placeholder)) {
      result = result.split(placeholder).join(value);
    }
  }
  return result;
}

/**
 * 判断文件是否为文本文件(需要做占位符替换)。
 * 二进制文件不替换。
 */
export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const textExts = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.toml',
    '.md', '.txt', '.yml', '.yaml', '.vue', '.css', '.scss', '.html',
    '.go', '.rs', '.java', '.py', '.xml', '.properties', '.sh',
    '.env', '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc',
    '.sql', '.mod', '.sum', '.lock', '.cfg', '.ini', '.conf',
  ]);
  // 无扩展名的配置文件(.gitignore, .editorconfig 等)
  if (!ext) {
    const base = path.basename(filePath);
    return base.startsWith('.') || ['Dockerfile', 'Makefile'].includes(base);
  }
  return textExts.has(ext);
}

/**
 * 模板注册表 —— 7 个模板的元数据 + 参数化规则。
 *
 * 这份数据是 CLI 的"单一事实源":
 *  - list / init / add 的选择器读 categories + tags
 *  - manifest.ts 读 defaults 生成 project.manifest.toml
 *  - render.ts 读 variables 做占位符替换
 *
 * 占位符约定:`__UPPER_SNAKE_CASE__`(双下划线包裹),不会和现有代码冲突。
 * pack-templates.mjs 负责把模板源里的硬编码值替换成这些占位符。
 */

export type ServiceType = 'go' | 'java' | 'python' | 'rust' | 'node' | 'static';
export type ServiceKind = 'web' | 'worker';
export type TemplateCategory = 'backend' | 'frontend' | 'fullstack';
export type LogFormat = 'jsonl' | 'text';

export interface TemplateDefaults {
  /** 默认 service_id(DNS-1123),通常等于模板 id */
  serviceId: string;
  /** 默认 proxy.path(对外路由前缀) */
  proxyPath: string;
  /** 是否剥掉前缀转发 */
  stripPrefix: boolean;
  /** logs.sources 的 glob 模式(相对日志目录,只匹配文件名) */
  logGlob: string;
  /** logs.sources 的 format */
  logFormat: LogFormat;
  /** text 格式时的多行起始正则(jsonl 不用) */
  multilineStartPattern?: string;
  /** 健康检查就绪路径(默认 /health,后端通常 /ready,Java 用 Actuator) */
  readinessPath?: string;
  startupPath?: string;
  livenessPath?: string;
  /** logs.sources 的 id(后端用 "application",前端/全栈用 "runtime") */
  logSourceId: string;
}

export interface TemplateMeta {
  /** 模板唯一标识,也是默认目录名 */
  id: string;
  /** 人类可读名称 */
  name: string;
  /** 分类:后端 / 前端 / 全栈单体 */
  category: TemplateCategory;
  /** 运行时语言类型(对应 project.manifest.toml 的 type 字段) */
  type: ServiceType;
  /** web(对外 HTTP) / worker(后台任务) */
  kind: ServiceKind;
  /** 框架标识,供 skill/选择器展示 */
  framework: string;
  /** 一句话描述 */
  description: string;
  /** 供模板选择器/skill 做匹配的标签 */
  tags: string[];
  /** 平台默认值 */
  defaults: TemplateDefaults;
  /**
   * 占位符 → 默认值映射。
   * pack-templates.mjs 用这些 key 在模板源里注入占位符;
   * render.ts 用用户参数替换占位符。
   * 不在此列的占位符(如 SERVICE_ID / PROXY_PATH)由 manifest 生成器处理,
   * 不需要在源码里替换。
   */
  variables: Record<string, string>;
  /**
   * pack-templates.mjs 的占位符注入规则。
   * key = 模板源里的文件相对路径,value = [{ from, to }] 替换规则。
   * to 不含 __ 包裹时 pack 会自动包成 __TO__。
   * 生成自 pack-templates.mjs 的 PLACEHOLDER_RULES,这里留空。
   */
  placeholderRules?: Record<string, Array<{ from: string; to: string }>>;
}

/**
 * 全部 7 个模板的注册表。
 * 按"后端 → 前端 → 全栈"排列,选择器按此序展示。
 */
export const TEMPLATES: TemplateMeta[] = [
  // ── 后端(4)─────────────────────────────────────────────
  {
    id: 'backend-go',
    name: 'Go Backend',
    category: 'backend',
    type: 'go',
    kind: 'web',
    framework: 'gin',
    description: 'Go (Gin + GORM) 后端,分层 CRUD + JSONL 日志 + DB readiness 探针',
    tags: ['go', 'gin', 'gorm', 'postgres', 'api', 'rest'],
    defaults: {
      serviceId: 'backend-go',
      proxyPath: '/api/go/',
      stripPrefix: true,
      logGlob: '__SERVICE_ID__*.log*',
      logFormat: 'jsonl',
      logSourceId: 'application',
      readinessPath: '/ready',
    },
    variables: {
      MODULE_NAME: 'backend-go',
      LOG_FILE: 'backend-go.log',
      HEALTH_SERVICE_TAG: 'go',
    },
  },
  {
    id: 'backend-java',
    name: 'Java Backend',
    category: 'backend',
    type: 'java',
    kind: 'web',
    framework: 'spring-boot',
    description: 'Spring Boot 3.5 + MyBatis-Plus,Actuator 三探针 + 多行文本日志',
    tags: ['java', 'spring-boot', 'mybatis-plus', 'postgres', 'api', 'rest'],
    defaults: {
      serviceId: 'backend-java',
      proxyPath: '/api/java/',
      stripPrefix: true,
      logGlob: '__SERVICE_ID__*',
      logFormat: 'text',
      logSourceId: 'application',
      multilineStartPattern: '^\\d{4}-\\d{2}-\\d{2}',
      startupPath: '/actuator/health/liveness',
      readinessPath: '/actuator/health/readiness',
      livenessPath: '/actuator/health/liveness',
    },
    variables: {
      JAVA_PACKAGE: 'com.example.backendjava',
      GROUP_ID: 'com.example',
      ARTIFACT_ID: 'backend-java',
      SPRING_APP_NAME: 'backend-java',
      LOG_FILE: 'backend-java.log',
      POOL_NAME: 'backend-java-pool',
      HEALTH_SERVICE_TAG: 'java',
    },
  },
  {
    id: 'backend-python',
    name: 'Python Backend',
    category: 'backend',
    type: 'python',
    kind: 'web',
    framework: 'fastapi',
    description: 'FastAPI + SQLAlchemy 2 (async),分层 CRUD + 多行文本日志',
    tags: ['python', 'fastapi', 'sqlalchemy', 'asyncpg', 'postgres', 'api'],
    defaults: {
      serviceId: 'backend-python',
      proxyPath: '/api/python/',
      stripPrefix: true,
      logGlob: '__SERVICE_ID__.log*',
      logFormat: 'text',
      logSourceId: 'application',
      multilineStartPattern: '^\\d{4}-\\d{2}-\\d{2}',
      readinessPath: '/ready',
    },
    variables: {
      APP_TITLE: 'backend-python',
      LOG_FILE: 'backend-python.log',
      LOGGER_NAME: 'backend-python.access',
      HEALTH_SERVICE_TAG: 'python',
      STARTUP_TAG: 'python',
    },
  },
  {
    id: 'backend-rust',
    name: 'Rust Backend',
    category: 'backend',
    type: 'rust',
    kind: 'web',
    framework: 'axum',
    description: 'Axum + sqlx + Tokio,OpenAPI (utoipa) + JSONL 日志 + 优雅关闭',
    tags: ['rust', 'axum', 'sqlx', 'tokio', 'postgres', 'api', 'rest'],
    defaults: {
      serviceId: 'backend-rust',
      proxyPath: '/api/rust/',
      stripPrefix: true,
      logGlob: '__SERVICE_ID__.log*',
      logFormat: 'jsonl',
      logSourceId: 'application',
      readinessPath: '/ready',
    },
    variables: {
      CRATE_NAME: 'backend-rust',
      LOG_FILE_PREFIX: 'backend-rust',
      OPENAPI_TITLE: 'backend-rust API',
      HEALTH_SERVICE_TAG: 'rust',
    },
  },

  // ── 前端 SPA(2)──────────────────────────────────────────
  {
    id: 'frontend-react-vite',
    name: 'React Vite Frontend',
    category: 'frontend',
    type: 'static',
    kind: 'web',
    framework: 'react',
    description: 'React 18 + Vite + TypeScript + Tailwind + shadcn/ui SPA,平台静态托管',
    tags: ['react', 'vite', 'typescript', 'tailwind', 'shadcn', 'spa', 'frontend'],
    defaults: {
      serviceId: 'frontend-react-vite',
      proxyPath: '/react',
      stripPrefix: true,
      logGlob: 'runtime.*.log',
      logFormat: 'text',
      logSourceId: 'runtime',
      readinessPath: '/health',
    },
    variables: {
      PACKAGE_NAME: '@nuwax-ai/react-vite',
      VITE_BASE: '/react/',
      HEALTH_SERVICE_TAG: 'react',
      HTML_TITLE: 'React Vite App',
    },
  },
  {
    id: 'frontend-vue3-vite',
    name: 'Vue Vite Frontend',
    category: 'frontend',
    type: 'static',
    kind: 'web',
    framework: 'vue',
    description: 'Vue 3 (Composition API) + Vite + TypeScript + Tailwind SPA,平台静态托管',
    tags: ['vue', 'vue3', 'vite', 'typescript', 'tailwind', 'spa', 'frontend'],
    defaults: {
      serviceId: 'frontend-vue3-vite',
      proxyPath: '/vue',
      stripPrefix: true,
      logGlob: 'runtime.*.log',
      logFormat: 'text',
      logSourceId: 'runtime',
      readinessPath: '/health',
    },
    variables: {
      PACKAGE_NAME: '@nuwax-ai/vue3-vite',
      VITE_BASE: '/vue/',
      HEALTH_SERVICE_TAG: 'vue',
      HTML_TITLE: 'Vue3 Vite App',
    },
  },

  // ── 全栈单体(1)──────────────────────────────────────────
  {
    id: 'userapp-next',
    name: 'Next.js Full-stack App',
    category: 'fullstack',
    type: 'node',
    kind: 'web',
    framework: 'next',
    description: 'Next.js 16 + Drizzle ORM + PostgreSQL 全栈单体,SSR + API routes + 迁移',
    tags: ['nextjs', 'react', 'drizzle', 'postgres', 'ssr', 'fullstack', 'catch-all'],
    defaults: {
      serviceId: 'userapp-next',
      proxyPath: '/',
      stripPrefix: false,
      logGlob: 'runtime.*.log',
      logFormat: 'text',
      logSourceId: 'runtime',
      startupPath: '/',
      readinessPath: '/api/health',
      livenessPath: '/',
    },
    variables: {
      PACKAGE_NAME: 'userapp-next-template',
      ARTIFACT_NAME: 'userapp-next-standalone',
      METADATA_TITLE: 'UserApp Next.js 模板',
      METADATA_DESCRIPTION: 'Next.js 16 + Drizzle ORM + PostgreSQL 一体化 UserApp 模板（运行于 RCoder）',
    },
  },
];

/* ── 查询辅助 ─────────────────────────────────────────────── */

export function getTemplate(id: string): TemplateMeta | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function listByCategory(category: TemplateCategory): TemplateMeta[] {
  return TEMPLATES.filter((t) => t.category === category);
}

/**
 * 根据语言简写(用户 --backend go / --frontend react)解析到模板 id。
 * 支持的简写:go/java/python/rust(后端),react/vue(前端),next(全栈)。
 */
export function resolveByAlias(alias: string): TemplateMeta | undefined {
  const map: Record<string, string> = {
    // 后端
    go: 'backend-go',
    golang: 'backend-go',
    java: 'backend-java',
    spring: 'backend-java',
    python: 'backend-python',
    py: 'backend-python',
    fastapi: 'backend-python',
    rust: 'backend-rust',
    // 前端
    react: 'frontend-react-vite',
    vue: 'frontend-vue3-vite',
    vue3: 'frontend-vue3-vite',
    // 全栈
    next: 'userapp-next',
    nextjs: 'userapp-next',
  };
  const id = map[alias.toLowerCase()];
  return id ? getTemplate(id) : undefined;
}

/**
 * 计算 service_id 派生值:日志文件名前缀通常和 service_id 一致。
 * 模板默认的 logGlob 用了 __SERVICE_ID__ 占位符,渲染时替换。
 */
export function deriveLogPrefix(serviceId: string): string {
  return serviceId;
}

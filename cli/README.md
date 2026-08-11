# @nuwax-ai/cli

UserApp workspace 模板脚手架 CLI。按需组合多语言前后端模板,生成可发布的 workspace 结构。

## 安装

```bash
# 全局安装
npm install -g @nuwax-ai/cli

# 或直接用 npx(推荐)
npx @nuwax-ai/cli <command>
```

## 命令

### `list` — 列出所有可用模板

```bash
create-userapp list
create-userapp list --category backend
```

### `init <dir>` — 新建 workspace

```bash
# 后端 + 前端组合
create-userapp init my-app --backend go --frontend react

# 纯后端
create-userapp init my-api --backend java

# 纯前端
create-userapp init my-web --frontend vue

# Next.js 全栈单体(独占 /)
create-userapp init my-fullstack --next
```

参数:
- `--backend <lang>`: 后端语言(go / java / python / rust)
- `--frontend <lang>`: 前端框架(react / vue)
- `--next`: 使用 Next.js 全栈单体
- `--force`: 覆盖已存在的目录

### `add <template-id>` — 往现有 workspace 追加 service

```bash
cd my-app  # 在 workspace 根目录
create-userapp add backend-rust

# 自定义 service_id 和路由
create-userapp add backend-go --service-id my-api --path /api/v2/
```

参数:
- `--service-id <id>`: 覆盖默认 service_id
- `--path <path>`: 覆盖默认 proxy.path
- `--force`: 覆盖已存在的目录

## 模板一览

| ID | 分类 | 语言/框架 | 默认路由 | 说明 |
|---|---|---|---|---|
| `backend-go` | 后端 | Go / Gin | `/api/go/` | Gin + GORM,JSONL 日志 |
| `backend-java` | 后端 | Java / Spring Boot | `/api/java/` | Spring Boot 3.5 + MyBatis-Plus |
| `backend-python` | 后端 | Python / FastAPI | `/api/python/` | FastAPI + SQLAlchemy 2 async |
| `backend-rust` | 后端 | Rust / Axum | `/api/rust/` | Axum + sqlx,OpenAPI |
| `frontend-react-vite` | 前端 | React / Vite | `/react` | React 18 + shadcn/ui SPA |
| `frontend-vue3-vite` | 前端 | Vue 3 / Vite | `/vue` | Vue 3 Composition API SPA |
| `userapp-next` | 全栈 | Next.js | `/` (catch-all) | Next.js 16 + Drizzle ORM + PG |

## 参数化机制

模板释放时会自动参数化以下内容(确保 service_id 一致性):

- **service_id**: 决定日志目录、路由 upstream、依赖引用
- **模块/包名**: Go module、Rust crate、Java artifactId 等跟随 service_id
- **日志文件名**: 各语言日志文件前缀跟随 service_id
- **路由前缀**: project.manifest.toml 的 proxy.path
- **Vite base**: 前端打包的 base 路径

自定义 service_id 时,所有身份相关变量会自动派生。例如:
```bash
create-userapp add backend-go --service-id my-api
# → go.mod 的 module 名 = my-api
# → import 路径 = my-api/internal/...
# → 日志文件 = my-api.log
```

## 路由约束

CLI 会校验以下平台规则(对齐 Fail-Fast):

- `service_id` 在 workspace 内唯一
- `proxy.path` 在 workspace 内唯一
- 全 workspace**最多一个 `/`**(catch-all,通常给 Next.js)
- `service_id` 符合 DNS-1123(小写字母/数字/横杠)

## 开发指南

### 项目结构

```
cli/
├── src/
│   ├── index.ts              CLI 入口
│   ├── templates.ts          模板注册表(元数据 + 参数化规则)
│   ├── render.ts             占位符替换引擎
│   ├── manifest.ts           manifest 生成器
│   ├── validate.ts           冲突校验
│   └── commands/
│       ├── init.ts           init 命令
│       ├── add.ts            add 命令
│       ├── list.ts           list 命令
│       └── release.ts        模板释放(init/add 共用)
├── scripts/
│   └── pack-templates.mjs    从 ../backend-go 等源目录打包模板
└── templates/                【构建产物】打包后的参数化模板
```

### 开发流程

```bash
# 1. 安装依赖
npm install

# 2. 打包模板(从仓库根的各子目录生成参数化模板)
npm run pack

# 3. 编译 CLI
npm run build

# 4. 本地测试
node dist/index.js init /tmp/test-app --backend go --frontend react
```

### 更新模板

1. 修改仓库根的模板源(如 `backend-go/internal/handler/health.go`)
2. 如果新增/修改了硬编码的 service_id 相关值,同步更新 `scripts/pack-templates.mjs` 的占位符注入规则
3. 运行 `npm run pack` 重新打包
4. 运行 `npm run build` 编译
5. 测试通过后 `npm publish`(会自动跑 build + pack)

### 发布

```bash
npm publish
# prepublishOnly 会自动执行: npm run build && npm run pack
```

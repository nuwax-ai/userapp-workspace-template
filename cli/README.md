# @nuwax-ai/template-cli

UserApp workspace 模板脚手架 CLI。按需组合多语言前后端模板,生成可发布的 workspace 结构。

## 安装

```bash
# 全局安装
npm install -g @nuwax-ai/template-cli

# 或直接用 npx(推荐)
npx @nuwax-ai/template-cli <command>
```

## 命令

### `list [category]` — 列出所有可用模板

```bash
template-cli list                 # 全部(后端 4 + 前端 2 + 全栈 1)
template-cli list backend         # 只看后端模板
template-cli list frontend        # 只看前端模板
template-cli list --category fullstack   # 等价写法
```

### `init <dir>` — 新建 workspace

```bash
# 后端 + 前端组合
template-cli init my-app --backend go --frontend react

# 纯后端
template-cli init my-api --backend java

# 纯前端
template-cli init my-web --frontend vue

# Next.js 全栈单体(独占 /)
template-cli init my-fullstack --next
```

参数:
- `--backend <lang>`: 后端语言(go / java / python / rust)
- `--frontend <lang>`: 前端框架(react / vue)
- `--next`: 使用 Next.js 全栈单体(独占 `/`,与 --backend/--frontend 互斥)
- `--service-id <id>`: 覆盖默认 service_id(仅单模板时有效)
- `--path <path>`: 覆盖默认 proxy.path(仅单模板时有效)
- `--force`: 覆盖已存在的目录

### `add <template-id>` — 往现有 workspace 追加 service

```bash
cd my-app  # 在 workspace 根目录
template-cli add backend-rust

# 自定义 service_id 和路由
template-cli add backend-go --service-id my-api --path /api/v2/
```

参数:
- `--service-id <id>`: 覆盖默认 service_id
- `--path <path>`: 覆盖默认 proxy.path
- `--kind <kind>`: 服务类型,`web`(默认,对外 HTTP)/ `worker`(后台任务,不声明 proxy、不参与路由校验)
- `--force`: 覆盖已存在的目录

**追加同类模板的第二个实例**(如 workspace 已有 backend-java,再加一个 java 后端):默认身份
(service_id 和 path)已被占用,直接 add 会被拒。**须同时指定 `--service-id` 和 `--path`**:

```bash
template-cli add backend-java --service-id java-admin --path /api/java-admin/
```

新实例的身份派生(artifactId/应用名/日志文件/目录名)自动跟随 service_id,见上文"参数化机制"。

### `docs` — 查看开发者文档

```bash
template-cli docs         # 打印随包分发的开发者文档目录(7 篇)
template-cli docs --open  # 用系统默认程序打开(macOS: open / Linux: xdg-open)
```

文档覆盖:核心概念、快速开始、manifest 字段参考、pingap 路由、日志、部署发布与回滚。

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
template-cli add backend-go --service-id my-api
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
│   ├── manifest.ts           manifest/AGENTS.md/index.html 生成器
│   ├── validate.ts           冲突校验
│   ├── update-check.ts       启动时更新检查(npm registry,24h 缓存)
│   └── commands/
│       ├── init.ts           init 命令
│       ├── add.ts            add 命令
│       ├── list.ts           list 命令
│       ├── docs.ts           docs 命令
│       └── release.ts        模板释放(init/add 共用)
├── scripts/
│   ├── pack-templates.mjs    从 ../backend-go 等源目录打包模板
│   ├── test-local.mjs        本地 E2E(npm test,与 CI 同口径)
│   └── release.mjs           发版辅助(beta/release:算版本号 + commit + tag)
├── docs/                     【随包分发】开发者文档(pack 时从 ../docs 同步)
└── templates/                【构建产物】打包后的参数化模板(gitignored)
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

发布走 **tag 触发 CI**,不在本地直接 `npm publish`:

```bash
npm run release:beta   # 0.1.3 → 0.1.3-beta.1 → 0.1.3-beta.2 ...(自动 bump + commit + tag)
npm run release        # 0.1.3-beta.2 → 0.1.3(去 beta 后缀)

git push origin main --tags   # 推 tag 触发 GitHub Actions 发布到 npm
```

Tag 规则:`v0.1.3-beta.1` → npm dist-tag `beta`;`v0.1.3` → dist-tag `latest`。

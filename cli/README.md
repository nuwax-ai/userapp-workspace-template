# @nuwax-ai/template-cli

UserApp workspace 模板脚手架 CLI。按需组合多语言前后端模板,生成可发布的 workspace 结构。

**运行时要求：** 0.1.14 生成的 React/Vue 模板需要 app-cli ≥ 0.3.7 和支持
`[proxy].dev_strip_prefix` 的 RCoder。请先配套升级运行时再构建、启动这些模板；
旧版运行时会拒绝新增的 manifest 字段。CLI 升级不会自动迁移已有项目。

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

用于真正为空的目标目录。已有项目手动导入后,请 agent 按
[接入指引](https://github.com/nuwax-ai/userapp-workspace-template/blob/main/skills/userapp-dev-guide/references/import-existing-project.md)
保留原技术栈、业务和依赖布局,增量适配；不要用 `init --force` 覆盖已有项目。
随 npm 包安装的正文可通过 `template-cli docs` 定位。

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
- `--kind <kind>`: `web` / `worker`，默认使用模板类型。HTTP 后端改 worker 保留健康服务；`worker-python` 默认 worker，以显式 process 检查启动（需 app-cli >= 0.3.9）。不允许 worker 搭配 `--path`、static worker 或 process 模板改 web。
- `--force`: 覆盖已存在的目录

**追加同类模板的第二个实例**(如 workspace 已有 backend-java,再加一个 java 后端):默认身份
(service_id 和 path)已被占用,直接 add 会被拒。**须同时指定 `--service-id` 和 `--path`**:

```bash
template-cli add backend-java --service-id java-admin --path /api/java-admin/
```

新实例的身份派生(artifactId/应用名/日志文件/目录名)自动跟随 service_id,见上文"参数化机制"。

### `docs` — 查看开发者文档

```bash
template-cli docs         # 打印随包分发的开发者文档目录
template-cli docs --open  # 用系统默认程序打开(macOS: open / Linux: xdg-open)
```

文档覆盖:核心概念、快速开始、manifest 字段参考、pingap 路由、日志、部署发布与回滚、已有项目接入和 worker 模式。

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

React/Vue 的 **Vite base 不再由 CLI 写入常量**：模板配置每次 dev/build 读取本模块
`project.manifest.toml` 的 `[proxy].path`。修改公共路径只改 TOML，再重启 dev 或重新构建 prod。
无额外路由环境变量；详细的多前端示例及存量模板升级见 [路由文档](docs/04-pingap-routing.md)。

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
- `proxy.path` 在 workspace 内唯一，CLI 将 `/admin` 与 `/admin/` 视为同一路由
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

已有项目接入正文仅维护在 `skills/userapp-dev-guide/references/import-existing-project.md`。
源码仓 `docs/07-import-existing-project.md` 为导航页,pack 时将该正文导出为随包分发的同名文档。

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
5. 测试通过后按下节升级版本并推送对应 tag，由 CI 发布

### 发布

发布走 **tag 触发 CI**,不在本地直接 `npm publish`:

```bash
# 在 cli 目录升级正式版，同时更新 package.json 和 package-lock.json
npm version patch --no-git-tag-version
npm run build && npm run pack && npm test

# 回到仓库根，核对并提交本次变更（含两个版本文件）后，再打匹配的 tag
cd ..
# 例如已提交版本为 0.1.18：
git tag v0.1.18
git push origin main refs/tags/v0.1.18
```

beta 使用明确的新版本号，例如 `npm version 0.1.19-beta.1 --no-git-tag-version`；提交、tag 和
推送步骤相同。旧辅助脚本的 `release` 只去掉 prerelease 后缀，不能用于正式版补丁升级。
已有 tag/npm 版本不可覆盖；发布后核验 CI、npm dist-tag 与实际 CLI 版本。

Tag 规则:`v0.1.3-beta.1` → npm dist-tag `beta`;`v0.1.3` → dist-tag `latest`。

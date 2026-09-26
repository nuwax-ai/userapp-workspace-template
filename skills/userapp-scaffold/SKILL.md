---
name: userapp-scaffold
description: >
  UserApp workspace 模板脚手架 CLI。当用户需要创建新的 UserApp workspace 项目、
  或往已有 workspace 添加 service 时使用。支持 Go/Java/Python/Rust 后端 +
  React/Vue 前端(含多个同类前端) + Next.js 全栈单体的组合。
  注意:manifest 字段、路由规划、健康检查、日志、部署回滚等平台规范,
  请参考 userapp-dev-guide skill。
  触发词:创建 userapp 项目、新建 workspace、添加后端、添加前端、userapp 模板、
  @nuwax-ai/template-cli、template-cli、init、add、worker。
---

# UserApp 模板脚手架

用 `@nuwax-ai/template-cli` 按需组合多语言模板,创建 UserApp workspace。

## 何时使用

- 用户说"创建一个 UserApp 项目" / "新建 workspace"
- 用户说"加一个 Go/Java/Python/Rust 后端"
- 用户说"加一个 React/Vue 前端"
- 用户说"我要一个全栈项目"(考虑 Next.js)
- 用户要在已有 workspace 里追加 service

## 核心命令

### 查看可用模板

```bash
npx @nuwax-ai/template-cli list            # 全部(后端 4 + 前端 2 + 全栈 1)
npx @nuwax-ai/template-cli list backend    # 只看后端: go / java / python / rust
npx @nuwax-ai/template-cli list frontend   # 只看前端: react / vue
```

### 查看开发者文档

```bash
npx @nuwax-ai/template-cli docs         # 列出随 CLI 分发的 7 篇开发者文档
npx @nuwax-ai/template-cli docs --open  # 用系统默认程序打开文档目录(macOS)
```

### 新建 workspace

```bash
# 后端 + 前端
npx @nuwax-ai/template-cli init <目录名> --backend <lang> --frontend <lang>

# 纯后端
npx @nuwax-ai/template-cli init <目录名> --backend python

# 纯前端
npx @nuwax-ai/template-cli init <目录名> --frontend react

# Next.js 全栈单体(独占 / 路由)
npx @nuwax-ai/template-cli init <目录名> --next
```

init 在 workspace 根自动生成:`workspace.manifest.toml`、`index.html`(入口首页占位页,catch-all 时跳过;
开发完成后须把它个性化为应用真实首页——标题/卡片用真实应用与功能名,详见 userapp-dev-guide「入口首页策略」;
**`add` 追加服务不会自动更新它**,追加/删除对外服务后需手动增删导航卡片)、
`AGENTS.md`(结构快照 + 规范/工具入口;规范与默认选型以 skills 为准,不写入该文件)、`CLAUDE.md`(`@AGENTS.md` 导入,供 Claude Code 读)、
`database/`(SQL 约定目录,规则见其 README);各子项目的 `project.manifest.toml` 由 CLI
按所选模板生成(不在模板包里),子项目另有 `database/README.md`。

### 往已有 workspace 追加 service

```bash
cd <workspace根目录>
npx @nuwax-ai/template-cli add <模板id>
# 例: npx @nuwax-ai/template-cli add backend-rust
```

## 模板选择指南

新应用未指定后端语言时，默认 **Python（FastAPI）**；前后端都需要时默认 **Python + React**。命令显式传 `--backend python`，不依赖 CLI 的隐式默认值。用户明确选型优先；已有应用沿用原技术栈，不因默认值迁移或重建。纯前端需求不额外添加后端，明确选择全栈单体时使用 Next.js。

| 用户需求 | 推荐模板 | 命令 |
|---|---|---|
| 纯 API 后端（未指定语言） | `backend-python` | `init <dir> --backend python` |
| 纯前端 SPA | `frontend-react-vite` / `frontend-vue3-vite` | `init <dir> --frontend react` |
| 前后端分离（未指定技术栈） | Python API + React SPA | `init <dir> --backend python --frontend react` |
| 全栈单体(DB + 前端) | `userapp-next` | `init <dir> --next` |
| 多个后端 | 主后端 + 追加 | init 后用 add 追加;**同类多实例须 `--service-id` + `--path`** |
| 加后台 worker | 后端模板 + `--kind worker`，保留内部健康服务 | `add backend-python --kind worker` |

### 语言/框架特性对比

**后端**:
- **Go (Gin)**: 编译型,启动快,JSONL 日志。适合高性能 API。
- **Rust (Axum)**: 编译型,内存安全,带 OpenAPI。适合对可靠性要求高的场景。
- **Java (Spring Boot)**: 生态成熟,MyBatis-Plus,Actuator 探针。企业级。
- **Python (FastAPI)**: 开发快,async,自动文档。适合快速原型/数据密集型。

**前端**:
- **React (Vite)**: React 18 + shadcn/ui,组件丰富。适合复杂交互。
- **Vue 3 (Vite)**: Composition API,中文友好。适合快速上手。

**全栈**:
- **Next.js**: SSR + API routes + Drizzle ORM + PG。前后端一体,独占 `/` 路由。
  适合"一个项目搞定一切"。但注意它和前端 SPA **二选一**(不能 Next + React SPA 共存)。

## 路由规划规则

CLI 自动分配默认路由,用户通常不用关心:

| 模板 | 默认 proxy.path | strip_prefix |
|---|---|---|
| backend-go | `/api/go/` | true |
| backend-java | `/api/java/` | true |
| backend-python | `/api/python/` | true |
| backend-rust | `/api/rust/` | true |
| frontend-react-vite | `/react` | true |
| frontend-vue3-vite | `/vue` | true |
| userapp-next | `/` (catch-all) | false |

React/Vue 模板还会生成 `dev_strip_prefix = false`：dev/build base 都带公共前缀，dev 交给 Vite 处理，prod 剥前缀后读取静态产物。需要 app-cli ≥ 0.3.7。

新模板的 `vite.config.ts` 通过 `scripts/manifest-routing.mjs` 在 dev/build 时读取本模块 TOML。
**公共路径只改 `[proxy].path`**，不改 Vite base、不增加路径环境变量或 `--base` 参数。
改路径后重启 dev，prod 重新构建发布；导航卡片按实际路径更新。旧模板需先同步 helper，详见 dev-guide。

**约束**:
- 全 workspace **最多一个 `/`**(catch-all)
- 路由 path 在 workspace 内**唯一**，CLI 将 `/admin` 与 `/admin/` 视为冲突
- CLI 会自动校验冲突,冲突时拒绝并提示

## 自定义 service_id

默认 service_id = 模板 id(如 `backend-go`)。需要自定义时:

```bash
npx @nuwax-ai/template-cli add backend-go --service-id my-api --path /api/v2/
```

自定义 service_id 时,身份相关变量自动派生:
- **子目录名** → `<service_id>`(模板释放到的目录直接以 service_id 命名,不再是模板名)
- Go module 名、Rust crate 名 → `<service_id>`(import 路径同步更新)
- Java artifactId、Spring 应用名 → `<service_id>`
- Python FastAPI title、Rust OpenAPI title → `<service_id>`
- 日志文件名前缀 → `<service_id>`

**注意:Java 的 package 名和源码目录不自动派生**。自定义 service_id 后,Java 的 `package com.example.backendjava;` 声明和 `src/main/java/com/example/backendjava/` 目录结构保持不变(只改 artifactId)。这能正常编译,但如果需要 package 名也跟着变,需手动 rename 目录和修改 package 声明。

## 同类模板的多实例(含两个 Vue 前端)

用户要"再加一个 java/rust/... 后端"时,**直接 `add backend-java` 会被拒绝**——默认身份
(service_id 和 path)已被第一个实例占用。这是 Fail-Fast 设计,不是 bug。

追加同类模板的第二个实例,**必须同时指定 `--service-id` 和 `--path`**:

```bash
# workspace 里已有 backend-java(service_id=backend-java, path=/api/java/)
npx @nuwax-ai/template-cli add backend-java --service-id java-admin --path /api/java-admin/

# 新应用只创建两个 Vue 模块(在空 workspace 执行 init)
npx @nuwax-ai/template-cli init . --frontend vue --service-id admin-web --path /admin/
npx @nuwax-ai/template-cli add frontend-vue3-vite --service-id portal-web --path /portal/
```

- 多个前端共享应用域名，分别访问 `/admin/`、`/portal/`；不需要为第二个 Vue 手改 Vite 配置。
- 不复制目录再重命名。由 CLI 生成唯一 service_id、manifest、路径，保留模板的路由读取和健康插件。
- 只给 `--service-id` 不给 `--path` 同样被拒(默认 path `/api/java/` 冲突);冲突报错会提示这两个参数
- 建议路由从 service_id 派生(`java-admin` → `/api/java-admin/`),语义清晰
- 新实例的身份派生规则(artifactId/应用名/日志文件/目录名自动跟随)见上节"自定义 service_id"
- 两个实例完全独立:各自独立构建(Maven 工程/Go module 按 service_id 命名)、独立日志目录、独立端口(平台注入 `$PORT`);同库建表由 advisory lock 串行化,并发首启安全

## 后台 Worker

需要后台任务(定时任务、队列消费者等)时,用 `--kind worker` 添加 service:

```bash
npx @nuwax-ai/template-cli add backend-python --kind worker --service-id my-worker
```

Worker 与 web 服务的区别:
- **不公开代理路由**,不声明 `[proxy]`；这不禁止内部 HTTP 健康接口
- manifest 里输出 `kind = "worker"`,无 `[proxy]` 段
- 仍参与拓扑排序/启动/日志,可在别的服务的 `depends_on` 里引用
- 当前 CLI 保留所选后端模板的 HTTP 入口与 `[health]`。Python worker 仍运行 FastAPI/Uvicorn,监听 `0.0.0.0:$PORT`；不要把 `main.py` 替换成只有任务循环的程序
- 在应用生命周期中启动后台任务并处理关闭；阻塞任务不能占住 HTTP 事件循环。健康接口应反映初始化与必要依赖状态,不能固定返回成功

当前模板与运行时的共同契约仍要求可探测的常驻服务。无监听的纯进程 worker 需要平台显式支持相应启动检查后才能使用,不能仅凭 `kind`、模块名称或应用自己的设计文档推断支持,也不要自行写入未列出的 manifest 字段。正常退出的批处理脚本不是常驻 worker。

## 生成后的典型操作

### 加业务模块(后端)

各后端采用分层架构,新增模块按现有 `item` 模块的模式复制:
- **Go**: `internal/{model,repository,service,handler}/<name>.go`
- **Java**: `model/`, `mapper/`, `service/`, `web/`
- **Python**: `app/{models,repositories,services,routers}/<name>.py`
- **Rust**: `src/{domain,repository,service,handlers}/<name>.rs`

### 前端访问后端

前端用**相对路径**调后端:
```typescript
fetch('/api/python/items')  // 浏览器经反代路由到 backend-python
```

## 重要约束

1. **Next.js 和前端 SPA 二选一**:Next.js 占 `/` catch-all。要后端 API + 前端 SPA,用 `--backend + --frontend`,不要用 `--next`。
2. **端口由平台定**:代码必须读 `$PORT` 环境变量,不能硬编码。
3. **页面默认支持平台 iframe**：用户明确要求禁止或限制嵌入时按其要求实现，说明平台内嵌预览可能不可用，并按用户选定策略验收；用户自行设置的明确嵌入策略不擅自覆盖，意图不明时先澄清。其余情况下，生成后及新增登录/安全中间件时，不得引入阻止平台嵌入的 X-Frame-Options 或 CSP；跨站 iframe 所需的应用会话 Cookie 使用 `SameSite=None; Secure`（会话保留 HttpOnly）。平台 ticket 不替代应用会话配置，curl 成功不代表浏览器验证通过。详细规则见 [userapp-dev-guide 的 iframe 兼容章节](../userapp-dev-guide/SKILL.md#平台-iframe-嵌入与会话兼容)。

> manifest 字段、路由规则、健康检查、日志、部署回滚等平台规范,
> 参考 **userapp-dev-guide** skill。

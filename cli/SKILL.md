---
name: userapp-template-scaffold
description: >
  UserApp workspace 模板脚手架。当用户需要创建新的 UserApp workspace 项目、
  或往已有 workspace 添加 service 时使用。支持 Go/Java/Python/Rust 后端 +
  React/Vue 前端 + Next.js 全栈单体的任意组合。
  触发词:创建 userapp 项目、新建 workspace、添加后端、添加前端、userapp 模板。
---

# UserApp 模板脚手架

用 `@nuwax-ai/cli` 按需组合多语言模板,创建 UserApp workspace。

## 何时使用

- 用户说"创建一个 UserApp 项目" / "新建 workspace"
- 用户说"加一个 Go/Java/Python/Rust 后端"
- 用户说"加一个 React/Vue 前端"
- 用户说"我要一个全栈项目"(考虑 Next.js)
- 用户要在已有 workspace 里追加 service

## 核心命令

### 查看可用模板

```bash
npx @nuwax-ai/cli list
```

### 新建 workspace

```bash
# 后端 + 前端
npx @nuwax-ai/cli init <目录名> --backend <lang> --frontend <lang>

# 纯后端
npx @nuwax-ai/cli init <目录名> --backend go

# 纯前端
npx @nuwax-ai/cli init <目录名> --frontend react

# Next.js 全栈单体(独占 / 路由)
npx @nuwax-ai/cli init <目录名> --next
```

### 往已有 workspace 追加 service

```bash
cd <workspace根目录>
npx @nuwax-ai/cli add <模板id>
# 例: npx @nuwax-ai/cli add backend-rust
```

## 模板选择指南

| 用户需求 | 推荐模板 | 命令 |
|---|---|---|
| 纯 API 后端 | `backend-go` / `backend-rust` | `init <dir> --backend go` |
| 纯前端 SPA | `frontend-react-vite` / `frontend-vue3-vite` | `init <dir> --frontend react` |
| 前后端分离 | 前端 SPA + 后端 API | `init <dir> --backend go --frontend react` |
| 全栈单体(DB + 前端) | `userapp-next` | `init <dir> --next` |
| 多个后端 | 主后端 + 追加 | init 后用 add 追加 |
| 加后台 worker | 无(需手动配 kind=worker) | 见 workspace 文档 |

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

**约束**:
- 全 workspace **最多一个 `/`**(catch-all)
- 路由 path 在 workspace 内**唯一**
- CLI 会自动校验冲突,冲突时拒绝并提示

## 自定义 service_id

默认 service_id = 模板 id(如 `backend-go`)。需要自定义时:

```bash
npx @nuwax-ai/cli add backend-go --service-id my-api --path /api/v2/
```

自定义 service_id 时,**所有身份相关变量自动派生**:
- Go module 名、Rust crate 名、Java artifactId → `<service_id>`
- 日志文件名前缀 → `<service_id>`
- import 路径、package 声明同步更新

## 生成后的典型操作

### 改路由前缀

编辑 `<service>/project.manifest.toml` 的 `[proxy].path`。

### 加业务模块(后端)

各后端采用分层架构,新增模块按现有 `item` 模块的模式复制:
- **Go**: `internal/{model,repository,service,handler}/<name>.go`
- **Java**: `model/`, `mapper/`, `service/`, `web/`
- **Python**: `app/{models,repositories,services,routers}/<name>.py`
- **Rust**: `src/{domain,repository,service,handlers}/<name>.rs`

### 前端访问后端

前端用**相对路径**调后端:
```typescript
fetch('/api/go/items')  // 浏览器经反代路由到 backend-go
```

### 数据库

容器自带 PostgreSQL(`localhost:5432`),读 `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` 环境变量。迁移用 `run.migrate`(仅 Next.js 模板预设)。

## 注意事项

1. **Next.js 和前端 SPA 二选一**:Next.js 占 `/` catch-all。如果同时要后端 API + 前端 SPA,用 `--backend + --frontend`,不要用 `--next`。
2. **至少一个 enabled service**:空 workspace 无法发布。
3. **端口由平台定**:代码里不要硬编码端口,必须读 `$PORT` 环境变量。
4. **环境变量明文保存**:敏感配置(如 DB 密码)直接写在 `project.manifest.toml` 的 `[env]` 里,以明文随源码保存。初始模板内置公共账号,用户自行修改。

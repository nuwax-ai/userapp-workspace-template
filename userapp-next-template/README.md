# UserApp Next.js 模板

Next.js 16 + Drizzle ORM + PostgreSQL 一体化应用模板，设计运行于 **RCoder** 应用管理平台的 `app-runtime-base` 镜像（内置 PostgreSQL + pgweb + ttyd，supervisor 托管）。clone 即用，开箱具备 **Server Component 直读 DB**、**Server Actions**、**数据库迁移**、**健康检查**等现代 App Router 范式。

## 技术栈

- **Next.js 16**（App Router）+ **React 19** + **TypeScript**（strict）
- **Drizzle ORM**（轻量 TS-first ORM）+ **node-postgres**
- **Tailwind CSS v4**
- **ESLint**（next/core-web-vitals + next/typescript）
- 运行时：RCoder `app-runtime-base` 镜像（内置 PG + pgweb + ttyd）

## 快速开始（本地开发）

```bash
# 1. 装依赖
npm install

# 2. 配置 env（需要可连的 PG；容器内默认 localhost:5432）
cp .env.example .env.local
#   按需改 POSTGRES_PASSWORD 等

# 3. 跑迁移 + 播示例数据（需 PG 已起）
npm run db:migrate
npm run db:seed

# 4. 启动开发服务器
npm run dev
#   打开 http://localhost:3000
```

访问 http://localhost:3000/users 体验用户管理 CRUD（Server Component 直读 DB + Server Actions）。

> 本地无 PG？最简方式：直接用 RCoder 部署（见下），容器自带 PG；或本地起一个：
> `docker run -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app -p 5432:5432 -d postgres:16`

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `POSTGRES_USER` | `app` | PG 用户 |
| `POSTGRES_PASSWORD` | `app` | PG 密码（生产请改） |
| `POSTGRES_DB` | `app` | PG 库名 |
| `PGHOST` | `localhost` | PG 主机（容器内 localhost） |
| `PGPORT` | `5432` | PG 端口 |
| `DATABASE_URL` | — | 可选，**设了则优先**于上面分散变量（外部 PG / Neon / Supabase 用） |
| `NODE_ENV` | — | 不在 .env 设；`npm run dev` 自动 development，生产由发布流程/容器 env 注入 production |
| `PORT` | `3000` | 应用端口（start.sh 读） |

## 数据库（Drizzle ORM）

- **Schema 权威源**：`src/db/schema.ts`（所有表在此定义）
- **连接**：`src/db/index.ts`（Drizzle client，`DATABASE_URL` 优先，否则 `POSTGRES_*` 兜底）

### 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run db:generate` | 改完 schema 后，生成迁移 SQL 到 `drizzle/` |
| `npm run db:migrate` | 应用迁移到 DB（容器启动时 start.sh 也会自动跑） |
| `npm run db:push` | 开发期直接把 schema 同步到 DB（跳过迁移文件） |
| `npm run db:studio` | 开 Drizzle Studio（浏览器 GUI 查改数据） |
| `npm run db:seed` | 播示例数据（users 表 3 行） |

### 加新表

1. 在 `src/db/schema.ts` 追加：`export const posts = pgTable('posts', { id: serial('id').primaryKey(), ... });`
2. `npm run db:generate` → 生成 `drizzle/0001_xxx.sql`
3. `npm run db:migrate` 应用（或容器启动时自动）

## 部署到 RCoder

两种模式（start.sh 自动检测 `/app/code/server.js`）：

### 模式 A：standalone 预 build（生产推荐，秒级启动）

本地预 build，容器不需 npm install/build（**~5s 启动**，对比源码模式 60s+）：

```bash
npm run build:standalone   # → userapp-next-standalone.zip（server.js + 最小 node_modules + migrate.js + drizzle/）
# 上传 standalone.zip 到 app 的 code/，create command=["sh","/app/code/start.sh"]
```

start.sh 检测 `server.js` → 等 PG → `node migrate.js`（drizzle 迁移）→ `node server.js`（0.0.0.0:3000）。

> standalone 跨架构：`next.config.ts` 已设 `images.unoptimized: true` 跳过 sharp（native），mac arm64 build 的产物能在 amd64 容器跑。

### 开发/调试：源码上传（容器内 build，慢）

zip 源码上传，容器内 install + build + start（~1min/重启，需 `--include=dev` + npm mirror）；仅调试用：

```bash
zip -r source.zip . -x "node_modules/*" ".next/*" ".git/*" "*.zip"
# 上传 source.zip 到 app 的 code/（无 server.js，start.sh 走源码模式）
```

> RCoder 起 `app-runtime-base` 镜像，`start.sh` 自动：装依赖 → 等 PG → 跑迁移 → 启动。

### 发布流程（开发中）

最终发布：**容器内编译 → 上传 standalone zip → 后端接口部署**（发布接口开发中）。
当前可用 RCoder upload API 手动测试：
`POST {rcoder-api}/api/v1/apps/<app-id>/upload -F file=@userapp-next-standalone.zip -F target=code/`

### 访问（经 pingora path 路由）

| 服务 | 地址（`{pingora}` = RCoder Pingora 入口） |
|---|---|
| 应用首页 | `{pingora}/proxy/apps/<app-id>/3000/` |
| 用户管理 | `{pingora}/proxy/apps/<app-id>/3000/users` |
| 健康检查 | `{pingora}/proxy/apps/<app-id>/3000/api/health` |
| **pgweb**（DB Web UI，端口 8081） | `{pingora}/proxy/apps/<app-id>/8081/` |
| **ttyd**（Web 终端，端口 7681） | 需在 deploy 的 ports 暴露后访问 |

pgweb 打开后点 "Add Connection"，填 `host=localhost port=5432 user=app password=app database=app sslmode=disable` 即可操作数据库。

## 应用 manifest（`app.manifest.toml`）

模板根的 `app.manifest.toml` 是**构建与部署声明**，给 rust 编排器（nuwax-publish，开发中）消费：

| 节 | 作用 |
|---|---|
| `[app]` | 应用名 + 语言（编排器据此分类） |
| `[build]` | native build 命令（`cmd`）+ 产物路径（`artifact`）。编排器跑 `cmd` → 上传 `artifact` |
| `[deploy]` | 组装 RCoder create app 字段（image/command/ports/env/resources） |

**核心**：模板与编排器通过 manifest **解耦** —— 编排器不关心语言（node/python/java/rust），只读 `[build].cmd` + `[deploy].*`。改 build 或部署配置只改 manifest，不改编排器。

```toml
[app]
name     = "next-template"
language = "node"

[build]
cmd      = "npm run build:standalone"
artifact = "userapp-next-standalone.zip"

[deploy]
image   = "...app-runtime:latest"   # 统一多语言镜像（rust:1.97/Debian + Node/Python/Java/Go/Rust）
command = ["sh", "/app/code/start.sh"]
ports   = [{ name = "app", port = 3000, expose_type = "Http" }, ...]
```

**多语言扩展**：未来 Python/Java/Rust 模板同模式（各自 native build + manifest），编排器零改动支持新语言。完整字段见 `app.manifest.toml` 注释。

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── users/route.ts          # GET 用户列表（REST）
│   │   ├── users/[id]/route.ts     # DELETE / PUT（RESTful）
│   │   ├── db/route.ts             # DB 状态诊断
│   │   └── health/route.ts         # 健康检查（DB ping，供 readiness）
│   ├── users/
│   │   ├── page.tsx                # async Server Component 直读 DB
│   │   └── actions.ts              # Server Actions（create/update/delete）
│   ├── layout.tsx / page.tsx
│   └── error.tsx / loading.tsx / not-found.tsx   # App Router 约定文件
├── components/
│   ├── AddUserForm.tsx             # <form action={Server Action}>
│   └── UserTable.tsx               # 接收 server 数据 + inline 编辑/删除
├── db/
│   ├── schema.ts                   # Drizzle schema（权威源）
│   ├── index.ts                    # Drizzle client
│   ├── migrate.ts                  # 运行时迁移（start.sh 调，不依赖 drizzle-kit）
│   └── seed.ts                     # 示例数据
drizzle/                            # 生成的迁移 SQL（需 commit 进仓库）
scripts/lib/helpers.sh              # start.sh 共享 helper（log / wait_for_pg）
scripts/build-standalone.mjs        # 打包 standalone 产物（npm run build:standalone，node 跨平台）
start.sh                            # 容器启动入口（函数化、分阶段，自动检测 standalone/源码模式）
drizzle.config.ts                   # Drizzle Kit 配置
eslint.config.mjs                   # ESLint flat config
```

## 启动流程（容器内 `start.sh`）

函数化、分阶段（加步骤只改对应函数）：

```
install_deps → ensure_pg(wait_for_pg) → run_migrations(drizzle) → start_app(next)
```

- **wait-for-pg**：`pg_isready` 轮询，等 PG 就绪再迁移/启动（避免 race condition 首请求 500）
- **生产迁移**：`drizzle-orm` 运行时 `migrate()`，不依赖 `drizzle-kit`（devDep）
- **0.0.0.0**：必须绑，容器外 Pingora 才能转发进来

## License

ISC

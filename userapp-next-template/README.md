# UserApp Next.js 模板

Next.js（App Router，`output: standalone`）+ Drizzle ORM + PostgreSQL 一体化应用模板，运行于
UserApp 平台的 `app-runtime` 运行时镜像。开箱具备 **Server Component 直读 DB**、**Server Actions**、
**幂等数据库迁移**、**健康检查**等现代 App Router 范式。

> 这是 workspace 中的一个 service。workspace 的构建、发布、Pingap 反代、日志聚合等平台行为
> 以 rcoder 仓库 `docs/userapp-workspace/` 与 `docs/application-management-service-v2-design.md` 为准；
> 本 README 只描述模板自身。

## 技术栈

- **Next.js**（App Router，`output: standalone`）+ React + TypeScript（strict）
- **Drizzle ORM**（轻量 TS-first ORM）+ node-postgres
- **Tailwind CSS**
- 运行时：UserApp `app-runtime` 镜像；workspace 公网入口由 **Pingap `:9080`** 统一反代

## 快速开始（本地开发）

```bash
# 1. 装依赖
npm install

# 2. 配置 env（需要可连的 PG）
cp .env.example .env.local      # 按需改 POSTGRES_PASSWORD 等

# 3. 跑迁移 + 播示例数据（需 PG 已起）
npm run db:migrate
npm run db:seed

# 4. 启动开发服务器
npm run dev                     # http://localhost:3000
```

访问 http://localhost:3000/users 体验用户管理 CRUD（Server Component 直读 DB + Server Actions）。

> 本地无 PG：`docker run -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app -p 5432:5432 -d postgres:16`

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `POSTGRES_USER` | `app` | PG 用户 |
| `POSTGRES_PASSWORD` | `app` | PG 密码（生产请改） |
| `POSTGRES_DB` | `app` | PG 库名 |
| `PGHOST` | `localhost` | PG 主机 |
| `PGPORT` | `5432` | PG 端口 |
| `DATABASE_URL` | — | 可选，设了则**优先**于分散变量（外部 PG / Neon / Supabase） |
| `PORT` | 平台注入 | 应用端口（release lock 确定性端口） |
| `HOSTNAME` | 平台注入 `0.0.0.0` | standalone `server.js` 监听地址；**由平台注入，不要覆盖** |
| `APP_LOG_DIR` | 平台注入 | 业务日志目录（stdout/stderr 由 app-cli 捕获到 `runtime.*.log`） |

## 数据库（Drizzle ORM）

- **Schema 权威源**：`src/db/schema.ts`
- **连接**：`src/db/index.ts`（`DATABASE_URL` 优先，否则 `POSTGRES_*` 兜底）

### 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run db:generate` | 改完 schema 后，生成迁移 SQL 到 `drizzle/` |
| `npm run db:migrate` | 应用迁移到 DB（本地） |
| `npm run db:push` | 开发期直接同步 schema 到 DB（跳过迁移文件） |
| `npm run db:studio` | Drizzle Studio（浏览器 GUI） |
| `npm run db:seed` | 播示例数据（users 表 3 行） |

### 加新表

1. 在 `src/db/schema.ts` 追加：`export const posts = pgTable('posts', { id: serial('id').primaryKey(), ... });`
2. `npm run db:generate` → 生成 `drizzle/0001_xxx.sql`
3. `npm run db:migrate` 应用（本地），或随 release 迁移（见下）

## 构建产物（standalone）

```bash
npm run build:standalone   # → userapp-next-standalone.zip
```

`scripts/build-standalone.mjs` 做：`next build`（standalone）→ esbuild 打包 `migrate.js`
（自包含 drizzle-orm）→ 拷 `.next/static`、`public`、`drizzle/` → 打 zip。**zip 根直接是
`server.js`（无顶层目录）**，含 `server.js` + 最小 `node_modules` + `migrate.js` + `drizzle/`。

> 跨架构：`next.config.ts` 已设 `images.unoptimized: true` 跳过 sharp（native），mac arm64 构建的产物能在 amd64 容器运行。

## 部署与运行（Manifest v2）

模板根 `project.manifest.toml` 是这个 service 的构建与运行声明：

```toml
[build]
command = ["npm", "run", "build:standalone"]      # 产 userapp-next-standalone.zip
artifact = "userapp-next-standalone.zip"

[run]
command = ["node", "server.js"]                    # 平台直接启动 standalone server.js
migrate = ["node", "migrate.js"]                   # 迁移：esbuild 打包的 drizzle 运行时 migrator
```

平台（app-cli）在一个 UserApp 容器内的启动顺序（设计文档 §6.1）：

1. 等待 PostgreSQL 就绪；
2. 按拓扑顺序执行每个 service 的 `run.migrate`（本项目即 `node migrate.js`）；
3. 启动 `run.command`（`node server.js`）；
4. Pingap（`:9080`）把公网流量按 `[proxy].path = "/"` 转发到本 service 的内部端口。

环境由平台注入，**不要在应用里覆盖**：`PORT`、`HOSTNAME=0.0.0.0`（standalone `server.js` 据此
监听所有接口）、`APP_LOG_DIR`、`APP_SERVICE_ID`。迁移幂等由 drizzle `__drizzle_migrations`
journal 保证（平台不做 down migration）。

### 健康检查

- `startup_path` / `liveness_path = "/"`：首页 SSR，廉价，不探 DB。
- `readiness_path = "/api/health"`：`src/app/api/health/route.ts` 执行 `SELECT 1`，DB 不可用时返回 503。

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
│   └── error.tsx / loading.tsx / not-found.tsx
├── components/
│   ├── AddUserForm.tsx             # <form action={Server Action}>
│   └── UserTable.tsx
├── db/
│   ├── schema.ts                   # Drizzle schema（权威源）
│   ├── index.ts                    # Drizzle client
│   ├── migrate.ts                  # 运行时迁移（打包成 migrate.js，由平台 run.migrate 调用）
│   └── seed.ts                     # 示例数据
drizzle/                            # 生成的迁移 SQL（需 commit）
scripts/build-standalone.mjs        # 打包 standalone 产物（npm run build:standalone）
drizzle.config.ts                   # Drizzle Kit 配置
```

## License

ISC

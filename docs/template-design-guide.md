# UserApp Workspace 模板设计指南

> 本文档面向**模板开发者**（你/agent）。读完你会知道：容器里有什么可用、manifest 怎么配、每种语言模板要满足什么要求。

---

## 1. 设计背景

### 1.1 为什么有 workspace 模板

UserApp 是 RCoder 平台上用户部署的应用。一个 UserApp = 一个 `app_id` = 一个容器（app-runtime 镜像）。用户的应用可能是：
- 单项目（一个 Next.js 全栈）
- 多项目（React 前端 + Go 后端 + Python 数据服务）

workspace 模板让用户**自由组合**多种语言/框架的项目，在一个容器里跑，通过 pingap 统一对外。

### 1.2 运行时架构

```
容器（app-runtime 镜像，supervisor 管 PG/pgweb/ttyd + [program:app]）
├── app-cli（/usr/local/bin/app-cli，[program:app] = 它）
│   ├── 自动发现子项目（扫描 /app/code/*/project.manifest.toml）
│   ├── wait PG → 各子项目 migrate → 各子项目 [run].command（端口 4000+i）
│   ├── 生成 pingap 配置 → spawn pingap（:9080, --autoreload, --admin 可选）
│   ├── 管理 API（:3010, /health /reload）
│   └── supervise（SIGTERM/任一退出 → kill all → supervisor 重启整组）
├── pingap（:9080 统一入口，/ → 前端兜底、/api/xxx → 后端）
├── PostgreSQL 16（:5432，内置）
├── pgweb（:8081，PG Web UI）
└── ttyd（:7681，Web 终端）
```

### 1.3 自动发现模式（无 [[projects]]）

- `workspace.manifest.toml` 只有 `[workspace]name` + `[deploy]`，**没有项目列表**
- 项目 = workspace 根下含 `project.manifest.toml` 的一级子目录
- 端口 = 4000 + 目录名字母序下标（`backend-go` < `backend-java` < `frontend-*` < `userapp-*`）
- **增删项目 = 增删目录**，无需改 workspace.manifest.toml

---

## 2. 容器环境（app-runtime 镜像内置）

### 2.1 PostgreSQL 16（内置，开箱即用）

| 项 | 值 |
|---|---|
| host | `localhost`（容器内） |
| port | `5432` |
| 默认数据库 | `app` |
| 默认用户名 | `app` |
| 默认密码 | `app` |
| pgweb（Web UI） | `http://<app-url>:8081` |

**所有语言模板都可以直接连这个 PG**，用环境变量覆盖（`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`/`PGHOST`/`PGPORT` 在 `[deploy].env` 里配）。

连接串示例：`postgresql://app:app@localhost:5432/app`

### 2.2 语言工具链

| 语言 | 版本 | 包管理 | 备注 |
|---|---|---|---|
| **Node.js** | 24 | npm / pnpm@10 | 全局包：pm2 typescript ts-node |
| **Python** | 3.11 | pip3 + uv | |
| **Java** | OpenJDK 25 LTS | Maven + Gradle | |
| **Go** | 1.26 | go modules | |
| **Rust** | 1.97 | cargo | rustup 预装 |

### 2.3 端口分配（自动，避免冲突）

| 端口 | 用途 | 谁分配 |
|---|---|---|
| **9080** | pingap 统一入口（对外） | 固定（app-cli 常量） |
| **3010** | app-cli 管理 API | 固定（app-cli 常量） |
| **4000+i** | 各子项目（内部） | app-cli 按目录名字母序自动分配 |
| 5432 | PostgreSQL | 内置 |
| 7681 | ttyd | 内置 |
| 8081 | pgweb | 内置 |

**模板不要硬编码端口**——用 `PORT` 环境变量（app-cli 自动设）。

### 2.4 其他内置服务

- **pgweb**（:8081）：PostgreSQL Web 管理界面，浏览器访问，可执行 SQL、看表结构。
- **ttyd**（:7681）：Web 终端，浏览器打开直接进容器 shell。
- **app-cli 管理 API**（:3010）：`GET /health`、`POST /reload`（重生成 pingap 配置）。

---

## 3. manifest 配置设计

### 3.1 workspace.manifest.toml（极简，用户几乎不改）

```toml
[workspace]
name = "my-app"

[deploy]
ports = [
  { name = "app", port = 9080, expose_type = "Http" },
  { name = "pgweb", port = 8081, expose_type = "Http" },
]
env = { NODE_ENV = "production", POSTGRES_USER = "app", POSTGRES_PASSWORD = "app", POSTGRES_DB = "app" }
```

- `name`：workspace 名称（显示用）
- `[deploy]`：平台读（image/resources/command 由平台自动填，不在 manifest 里）
- `ports`：暴露端口（9080=pingap 统一入口，8081=pgweb）
- `env`：环境变量（注入到容器，所有子项目 + app-cli 都能读）

### 3.2 project.manifest.toml（每个子项目，完整自描述）

```toml
[project]
name = "backend-java"            # 可选，缺省=目录名
type = "java"                    # node / java / python / go / rust

[build]
cmd = "sh scripts/build-standalone.sh"  # 容器内跑的 build 命令（经 sh -c）
artifact = "artifact.zip"                # 产物相对路径（cwd=子项目目录）

[run]
command = ["java", "-jar", "app.jar"]   # app-cli 启动命令（语言无关）
migrate = ["java", "-jar", "migrate.jar"] # 可选：启动前迁移

[proxy]                              # 可选：没有 [proxy] = 不经 pingap（仅内部服务）
path = "/api/java/"                  # pingap location 路径
strip_prefix = true                  # 转发前去前缀（后端收到 /health 而非 /api/java/health）
cache = false                        # 可选：响应缓存
rate_limit = 600                     # 可选：IP 限流（每 60s 每 IP N 次）
```

### 3.3 build 产物要求

- `[build].cmd` 跑完后必须产出 `[build].artifact` 指定的 **zip 文件**
- zip 内容 = 运行时需要的全部文件（解压后在 `/app/code/<dir>/` 下）
- **zip 根直接是文件**（无顶层目录），例：
  ```
  artifact.zip
  ├── server（Go 二进制）
  └── config.yml
  ```
  解压后 `/app/code/backend-go/server` + `/app/code/backend-go/config.yml`

### 3.4 端口约定

app-cli 设 `PORT` 环境变量（4000+i），**模板必须从 `PORT` 读端口**，不要硬编码。

| 语言 | 读 PORT 示例 |
|---|---|
| Node | `process.env.PORT` |
| Java | `System.getenv("PORT")` |
| Go | `os.Getenv("PORT")` |
| Python | `os.environ.get("PORT")` |
| Rust | `std::env::var("PORT")` |

---

## 4. 各语言模板要求

### 通用要求（所有语言）

1. **`/health` 端点**：返回 `{"status":"ok","service":"<lang>"}`，200 状态码。app-cli + pingap 用它做健康检查。
2. **监听 `0.0.0.0:$PORT`**：不要 `127.0.0.1`（pingap 从容器内另一进程拨号）。
3. **`scripts/build-standalone.sh`**：build + 打 zip。每个语言不同（见下）。
4. **`project.manifest.toml`**：完整配置（[project]+[build]+[run]+[proxy]）。
5. **PG 连接示例**：连内置 PG（`localhost:5432`，`app/app/app`），展示如何用；**显式配置连接池**。
6. **示例数据接口（全 CRUD + 逻辑删除）**：
   - `GET/POST /items`，`GET/PUT/DELETE /items/{id}`
   - 错误体 `{ "error": "..." }`；校验失败 400；不存在 404
   - 统一示例表结构（**注意**：多语言共享同一 PG 的 `items` 表，同时跑多个 backend 会互相读写；生产请分表/分库）：
     ```sql
     CREATE TABLE IF NOT EXISTS items (
       id BIGSERIAL PRIMARY KEY,
       name TEXT NOT NULL,
       deleted INT NOT NULL DEFAULT 0
     );
     ```
   - DELETE = 逻辑删除（`deleted=1`），列表自动过滤
   - 同时提供 `/api/items` 别名（`strip_prefix` 未生效时的兜底）
   - 中间件对齐：`X-Request-Id` + 访问日志
7. **分层架构**：`config` / `model` / `repository|mapper` / `service` / `handler|router|controller`；入口只做组装。
8. **建表策略**：启动幂等 `CREATE/ALTER IF NOT EXISTS`（开箱即用）；注释标明生产可换正式迁移工具。
9. **单文件体量**：业务/入口源文件建议 **≤150 行**；超过则按职责拆（logging、router、middleware、hooks）。专用生成物（如 Tailwind safelist）可单独成文件，不必硬塞进 config。

### 4.1 Java（Spring Boot + MyBatis-Plus + HikariCP）

**要求**：
- Spring Boot **3.5.x**（Java 25 LTS）+ Maven（`pom.xml`）；暂不跟 Boot 4（等 MP Boot4 starter 成熟）
- `mybatis-plus-spring-boot3-starter` **3.5.17+** + 显式 `mybatis-plus-extension` / `mybatis-plus-jsqlparser` + PostgreSQL + validation + actuator
- `application.yml`：`PORT` / `POSTGRES_*` / `PGHOST` / `PGPORT` + **HikariCP 显式池参数** + 滚动文件日志
- 分层：`model` / `mapper` / `service(+impl)` / `web`(Controller+DTO) / `config`
- **Service 注入 Mapper**，不要继承已弃用方向的 `IService`/`ServiceImpl`（MP 3.5.9+ 建议业务层与通用 CRUD 基类解耦）
- Item 全 CRUD + `@TableLogic` 逻辑删除；启动 `SchemaInitializer` 幂等建表
- `scripts/build-standalone.sh`：
  ```sh
  mvn clean package -DskipTests
  cp target/*.jar app.jar
  zip artifact.zip app.jar
  ```
- `[run].command = ["java", "-jar", "app.jar"]`

### 4.2 Go（Gin + GORM）

**要求**：
- `go.mod`（与镜像 Go 版本对齐）；**Gin** + **GORM** + `gorm.io/driver/postgres`
- 分层：`cmd/server` + `internal/{config,db,model,repository,service,handler,middleware,logging}`
- 中间件：`X-Request-Id`、访问日志、Recover；`slog` + lumberjack 日滚日志
- `/health` + items 全 CRUD（逻辑删除）；显式 sql.DB 连接池参数
- `scripts/build-standalone.sh`：
  ```sh
  go build -o server ./cmd/server
  zip artifact.zip server
  ```
- `[run].command = ["./server"]`

### 4.3 Python（FastAPI + SQLAlchemy 2 async）

**要求**：
- FastAPI + uvicorn + **SQLAlchemy 2.0 asyncio** + asyncpg + pydantic-settings（钉死较新稳定版）
- 包结构：`main.py`（薄入口）+ `app/{config,db,models,schemas,repositories,services,routers,middleware}`
- lifespan 管理 engine + 日滚文件日志；`X-Request-Id` 中间件
- `/health` + items 全 CRUD（逻辑删除）
- `scripts/build-standalone.sh`：
  ```sh
  pip install -t deps/ -r requirements.txt
  zip -r artifact.zip main.py app/ deps/
  ```
- `[run].command = ["python3", "main.py"]`（内部 `uvicorn.run(..., host="0.0.0.0", port=PORT)`；`sys.path` 注入 `deps/`）

### 4.4 Rust（Axum + sqlx）

**要求**：
- `Cargo.toml`：axum 0.8 + tokio + sqlx(postgres) + serde + tracing + tower-http 0.7
- 分层：`config` / `db` / `domain` / `repository` / `service` / `handlers` / `routes` / `middleware` / `logging`；`AppState` 持有 `ItemService`
- 中间件：Request-Id、Trace、Timeout、Compression；`tracing-appender` 日滚日志
- `/health` + items 全 CRUD（逻辑删除）；`PgPoolOptions` 显式池参数；路径参数用 `{id}`（Axum 0.8）
- `scripts/build-standalone.sh`：
  ```sh
  cargo build --release
  cp target/release/server .
  zip artifact.zip server
  ```
- `[run].command = ["./server"]`
- **注意**：Rust 编译慢（首次 5+ 分钟），`[build].cmd` 的 timeout 要够（默认 600s）。

### 4.5 Node.js 前端（Vite SPA）

**要求**：
- Vite + React/Vue
- `vite.config.ts` 设 `base: '/<route>/'`（对应 [proxy].path）
- `static-server.cjs`（10 行 Node 内置 http 静态服务器 + SPA fallback）
- `scripts/build-standalone.sh`：
  ```sh
  npm install --no-audit --no-fund
  npm run build
  cp static-server.cjs dist/
  cd dist && zip -r ../artifact.zip . && cd ..
  ```
- `[run].command = ["node", "static-server.cjs"]`
- **注意 `.cjs` 扩展名**：package.json `"type": "module"` 时 `.js` 会被当 ESM 解析，`require()` 报错。

### 4.6 Node.js 全栈（Next.js standalone）

**要求**：
- `next.config.ts` 设 `output: "standalone"`
- `scripts/build-standalone.mjs`：next build + esbuild migrate + 拷静态资源 → zip
- `[run].command = ["node", "server.js"]`
- `[run].migrate = ["node", "migrate.js"]`（Drizzle esbuild bundle）
- 参考现有 `userapp-next-template/`

---

## 5. 路由约定

### 5.1 路径规划

| 类型 | proxy.path | strip_prefix | 说明 |
|---|---|---|---|
| 全栈 catch-all | `/` | false | 兜底（Next.js 全栈，其余未匹配的都到它） |
| 前端子应用 | `/react`, `/vue` | true | Vite SPA 子路径（vite base 对应） |
| 后端 API | `/api/go/` `/api/java/` `/api/python/` `/api/rust/` | true | 去前缀，后端收到 `/health`、`/items` |

### 5.2 pingap 默认插件（零配置，每个 location 自动带）

- `pingap:requestId`：请求 ID（`X-Request-Id`）
- `pingap:compressionUpstream`：gzip/br/zstd 响应压缩

### 5.3 可选插件（[proxy] 字段驱动）

- `cache = true`：响应缓存（内存 100mb，ttl 10m）
- `rate_limit = 600`：IP 限流（每 60s 每 IP 600 次）

---

## 6. 文件结构要求

每个语言模板子目录：

```
backend-xxx/
├── project.manifest.toml       ← 必须
├── scripts/
│   └── build-standalone.sh     ← 必须（build + zip）
├── src/ 或 源码文件             ← 语言相关
├── （依赖声明：pom.xml / go.mod / requirements.txt / Cargo.toml / package.json）
└── .gitignore                  ← 排除 artifact.zip + 构建产物
```

---

## 7. 验证清单

开发完一个语言模板后，逐项检查：

- [ ] `project.manifest.toml` 四段齐全（[project] + [build] + [run] + [proxy]）
- [ ] `scripts/build-standalone.sh` 能在容器里跑通（产出 artifact.zip）
- [ ] `[run].command` 启动后监听 `0.0.0.0:$PORT`
- [ ] `/health` 返回 200 JSON
- [ ] 能连 PG（`localhost:5432`, `app/app/app`）
- [ ] 有至少一个 CRUD 示例接口（GET/POST/PUT/DELETE `/items`，逻辑删除）
- [ ] 分层目录齐全（config / model / repo|mapper / service / handler|router）
- [ ] 连接池参数显式配置（可用 env 覆盖）
- [ ] `bash -n scripts/build-standalone.sh` 语法通过
- [ ] 删掉 `artifact.zip` + 构建产物后 `.gitignore` 生效

---

## 8. 平台行为补充（模板开发者了解即可）

### 8.1 app-cli 启动流程

```
1. 扫描 /app/code/*/project.manifest.toml → 发现项目（字母序）
2. wait PG（pg_isready 轮询，30 次 × 2s）
3. 各项目 [run].migrate（如有）
4. 各项目 [run].command（PORT=4000+i, HOSTNAME=0.0.0.0, stdout/stderr → /app/logs/<dir>.{out,err}.log）
5. 生成 pingap.toml（从有 [proxy] 的项目）→ spawn pingap -c pingap.toml --autoreload [--admin=...]
6. 管理 API :3010
7. supervise：SIGTERM / 任一退出 → kill all → 退出 → supervisor 重启
```

### 8.2 日志位置

- 子项目运行日志：`/app/logs/<dir>.out.log` + `/app/logs/<dir>.err.log`（app-cli 自动重定向）
- app-cli 自身日志：supervisor stdout/stderr
- pingap 日志：pingap 自己写（`--log` 配置）
- PG 日志：supervisor `/app/logs/pg.*.log`

### 8.3 构建（file-server 侧）

```
POST /api/userapp/build {appId}
  → resolve_project(appId) → workspace 根
  → discover_projects → 扫描含 project.manifest.toml 的子目录
  → 各 [build].cmd → 各 [build].artifact（zip）
  → 组装 workspace-package.zip：
      各子项目 zip 内容（加 {dir}/ 前缀）
      workspace.manifest.toml
      各 project.manifest.toml
  → 返 workspace-package.zip
```

### 8.4 部署（Java 侧）

```
Java 取 workspace-package.zip → upload（Java 存储）→ url
Java 调 app_manager upload_from_url（解压到 /app/code/）
Java 调 create_app（[deploy] → CreateAppRequest，image/resources 由平台填）
→ 容器启动 → start-app.sh → supervisor → [program:app] = app-cli → 编排
```

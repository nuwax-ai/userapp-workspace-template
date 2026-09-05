---
name: userapp-dev-guide
description: >
  UserApp 平台开发规范权威指南。当用户在 UserApp workspace 里开发服务、
  写或改 manifest 配置、规划路由、处理健康检查、声明日志、发布部署、回滚、
  排查错误、本地运行验证时使用。覆盖:核心概念、manifest 全字段、校验规则、
  环境变量约定、数据库连接、反向代理与路由(strip_prefix/catch-all/服务互调)、
  健康探针、日志、发布状态机、版本保留、回滚、迁移约定、常见错误排查、
  app-cli 本地开发与测试(gen-lock 秒级验证/本地编排运行)。
  触发词:manifest 配置、project.manifest、workspace.manifest、service_id、
  proxy path、strip_prefix、路由、catch-all、反代、pingap、健康检查、探针、
  readiness、liveness、SIGTERM、优雅关闭、日志、发布、部署、上线、回滚、
  迁移、migrate、启动失败、502、404、端口、PORT、环境变量、数据库连接、
  app-cli、gen-lock、release.lock、本地运行、本地验证、本地测试、集成验证。
---

# UserApp 平台开发指南

## 核心概念

| 概念 | 是什么 |
|---|---|
| **app_id** | 平台里一个应用的稳定 ID,对应一个 workspace + 一套持久存储 |
| **workspace** | 你一次提交的全部源码集合。根目录一个 `workspace.manifest.toml` + 若干子项目。**构建/发布/回滚的原子单位** |
| **service** | workspace 里一个可独立构建、启动、产日志的子项目。每个有自己的 `project.manifest.toml` |

```
app_id = my-app
 └─ workspace(根目录)
     ├── workspace.manifest.toml
     ├── backend-go/ ── project.manifest.toml ┐
     ├── backend-java/ ── project.manifest.toml ├─ 每个 = 一个 service
     └── frontend-react/ ── project.manifest.toml ┘
```

## 六条铁律

1. **两级 Manifest** — 根目录 `workspace.manifest.toml`,每个一级子目录 `project.manifest.toml`。平台**只认**这两个确切文件名
2. **严格校验,Fail Fast** — 未知字段、非法枚举、重复路由、依赖环 → 构建立即失败。每段 `deny_unknown_fields`
3. **端口由平台定** — 必须监听 `0.0.0.0:$PORT`(`PORT` 由平台注入,4000–7999)。**硬编码端口 = 必错**
4. **镜像/资源/端口由平台管** — 不在 TOML 里配
5. **service_id 是稳定身份** — 不是目录名。决定日志目录、路由 upstream、依赖引用。一旦上线别改
6. **命令是 argv,不走 shell** — 需要 shell 功能要显式 `["sh","-c","..."]`

---

## Manifest 字段参考

### workspace.manifest.toml

```toml
schema_version = 1                  # 必填,当前 = 1

[workspace]
name = "my-app"                     # 必填,非空
description = "一句话描述"            # 可选

[pingap]
mode = "managed"                    # 可选,默认 managed(managed/extend/custom)
# config = "pingap/"                # 仅 extend/custom;managed 下禁止

[health]
bridge_service = "api"              # 可选:把 /ready 桥接到该后端深检查
```

### project.manifest.toml

```toml
schema_version = 1

[project]
service_id = "api"                  # 必填,DNS-1123(小写/数字/-,1-63),workspace内唯一
name = "My API"                     # 必填
type = "go"                         # 必填:node/java/python/go/rust/static
kind = "web"                        # 可选,默认web。web/worker(worker不能声明[proxy])
enabled = true                      # 可选,默认true

[build]
command = ["sh", "scripts/build.sh"]  # 必填,argv数组
artifact = "artifact.zip"           # 必填,产物相对路径

[devbuild]                          # 可选,dev阶段编译/准备命令(依赖安装/type-check等,不要求产artifact)
command = ["pnpm", "run", "type-check"]  # 仅配了[devrun]的源码态dev链路生效。缺省三分派:只配[devrun]
                                    # 的服务跳过编译(devrun自足不消费产物);未配[devrun]回落[build].command

[run]
command = ["./server"]              # 必填,必须监听 0.0.0.0:$PORT
migrate = ["./migrate"]             # 可选,启动前按拓扑序执行,必须幂等
depends_on = ["worker"]             # 可选,控制启动顺序
shutdown_timeout_seconds = 30       # 可选,默认30

[devrun]                            # 可选,dev阶段热加载启动;缺省回落[run].command
command = ["pnpm", "exec", "vite"]  # 配置即切源码态且声明dev态自足(未配[devbuild]则跳过编译):
                                    # dev/start·restart编译([devbuild]显式配置则执行)后
                                    # app-cli直接编排源码workspace(改码即生效),不部署.run;
                                    # 须监听0.0.0.0:$PORT(注入同[run]);生产不读本段

[health]                            # 整段可选,默认 /health
startup_path = "/health"
readiness_path = "/ready"           # 不ready摘流,不重启
liveness_path = "/health"           # 连续失败重启容器

[proxy]                             # 可选;worker禁止
path = "/api/"                      # workspace内唯一,最多一个/
strip_prefix = true                 # true=剥掉前缀再转发

[[logs.sources]]
id = "application"                  # DNS-1123,本service内唯一
glob = "app*.jsonl"                 # 相对日志目录,不含/或\
format = "jsonl"                    # jsonl/text
multiline_start_pattern = "^\\d+"   # 仅text可用

[env]                               # 不能用保留键
LOG_LEVEL = "debug"
```

### 枚举速查

| 字段 | 合法取值 |
|---|---|
| type | `node` / `java` / `python` / `go` / `rust` / `static` |
| kind | `web`(默认) / `worker` |
| pingap.mode | `managed`(默认) / `extend` / `custom` |
| logs.format | `jsonl` / `text` |

---

## 环境变量与目录

### 平台注入的保留变量([env] 不能覆盖)

| 变量 | 值 | 代码应该 |
|---|---|---|
| `PORT` | 平台分配的端口(4000–7999) | **监听 `0.0.0.0:$PORT`** |
| `HOSTNAME` | `0.0.0.0` | 绑到它 |
| `APP_LOG_DIR` | `/app/logs/<service_id>` | 日志文件写进这里 |
| `APP_SERVICE_ID` / `APP_RELEASE_ID` | 本服务身份 | 需要时读取 |

禁止 key:`PORT`/`HOST`/`HOSTNAME`/`APP_LOG_DIR`/`APP_SERVICE_ID`/`APP_RELEASE_ID`,以及 `RCODER_` 开头。

### 容器内固定目录

| 目录 | 内容 |
|---|---|
| `/app/code` | 当前激活的 release 代码 |
| `/app/data` | PostgreSQL 数据 + 用户持久数据 |
| `/app/logs/<service_id>/` | 每个 service 独立日志目录 |

### 数据库(PostgreSQL)

容器自带 PG(同容器 `localhost:5432`),连接串:
```
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}
```
默认 user/db = `app`,密码平台注入。**不要在 [env] 里覆盖这些**。

---

## 反向代理与路由

### 流量模型

```
浏览器 → 应用子域名 → 容器内 Pingap(:9080) → 按 path 前缀路由
                         ├──► /api/go/*   → backend-go
                         ├──► /react/*    → frontend-react
                         └──► /*          → userapp-next (catch-all)
```

### Pingap 三模式

| 模式 | 谁配路由 | 适用 |
|---|---|---|
| `managed`(默认) | 平台自动按 `[proxy]` 生成 | 绝大多数 |
| `extend` | 平台 + 你的插件 | 加限流/缓存 |
| `custom` | 你完全自定义 | 完全控制路由(地址写 `rcoder://<service_id>`) |

### strip_prefix

| strip_prefix | 外部请求 `/api/go/health` | 后端收到 |
|:---:|---|---|
| `true` | `/api/go/health` | `/health`(前缀被剥) |
| `false`(默认) | `/api/go/health` | `/api/go/health`(原样) |

- **API 后端**:`strip_prefix = true`(后端按根路径写)
- **SPA 前端**:`strip_prefix = true`(前端按根路径打包)
- **Next.js 单体 `/`**:`strip_prefix = false`(自己处理全部路由)

### 路由规则

- proxy.path 在 workspace 内**唯一**
- 全 workspace**最多一个 `/`**(catch-all,通常给主前端)
- 具体前缀优先于 catch-all 命中
- **worker 不能声明 [proxy]**

### 服务间互调(推荐:走容器内反代)

```typescript
// 前端用相对路径调后端
fetch('/api/go/items')
```
地址固定 `http://127.0.0.1:9080/<proxy.path>/...`,不依赖平台端口。

> `depends_on` 只控制启动顺序,**不是服务发现**——不注入对方地址。

---

## 健康检查

三个探针(发 GET,期望 2xx):

| 探针 | 默认路径 | 失败后果 |
|---|---|---|
| **startup** | `/health` | 决定是否启动完成 |
| **readiness** | `/health` | 不 ready → **摘流**(不转发),不重启 |
| **liveness** | `/health` | 连续失败 → **重启容器** |

**建议**:readiness 覆盖 DB 等依赖(连不上返非2xx摘流);liveness 只反映进程本身(别放外部依赖)。

workspace 级桥接(可选):`[health].bridge_service = "api"` → 该后端不 ready 整个应用摘流,但 `/health` 仍 200。

---

## 日志

### 两条来源

| 来源 | 配置 |
|---|---|
| 应用文件日志 | `[[logs.sources]]` 声明 glob |
| stdout/stderr 捕获 | 自动生成 `runtime.out.log`/`runtime.err.log`(要在面板看需声明匹配的 source) |

### 声明日志源

```toml
[[logs.sources]]
id = "application"          # DNS-1123,本service唯一
glob = "app*.jsonl"          # 只匹配文件名,不含/或\
format = "jsonl"             # jsonl(推荐) / text
multiline_start_pattern = "^\\d{4}-\\d{2}-\\d{2}"  # 仅text(Java堆栈等)
```

应用自己负责轮转(建议 JSONL、按天或100MiB、保留14天)。平台只读不写。

---

## 发布与回滚

### 发布链路(点「发布」一键完成)

```
构建 → release.lock.toml → 发布包 → prepare(校验) → activate(切代码+启动) → confirm(探活)
                                                                      ↓
                                                            Active 或 Failed(+自动回滚)
```

| 状态 | 含义 |
|---|---|
| `Prepared` | 已下载校验存档 |
| `PendingStart` | 代码已切,启动中 |
| `Active` | 健康确认,正式上线 |
| `Failed` | 激活/确认失败,已自动回滚 |

### 回滚

回滚 = 重新激活历史保留版本。**回滚不执行数据库 down migration**。

### 版本保留

默认保留最近 **15 个成功版本**(可配2–100)。当前 Active 版本始终保护。

### 数据库迁移约定

`run.migrate` 启动前按拓扑序执行,任一失败整个 workspace 启动失败。必须:
1. **幂等** — 可重复执行不报错
2. **新旧代码短期兼容同一 schema** — 回滚时 schema 不退
3. **先 expand 再发代码最后 contract** — 加列先加,删列等旧代码下线
4. **平台不执行 down migration**

### 优雅关闭

SIGTERM → 等 `shutdown_timeout_seconds`(默认30s) → SIGKILL。服务收到 SIGTERM 应停止接新请求、排空在途、关连接。

---

## app-cli 本地开发与测试

`app-cli` 是平台运行时编排器(生产装在 app-runtime 容器内,替代 start.sh:编排子服务
+ Pingap 反代 + 健康/日志/代理管理 API)。本地开发用它做两件事:
**manifest/路由秒级验证**(`--gen-lock`)和**多服务本地集成验证**(编排模式)。
日常单服务编码不需要它——直接 `PORT=xxxx` 起 dev server 即可。

开发沙箱容器内已预装 `app-cli` 和 `pingap`(平台统一版本),命令直接可用,无需安装。

### 命令行参数与环境变量

`app-cli --help` 随时可查;每个参数都有同名 env 等价(命令行值优先):

| 参数 | env | 默认 | 说明 |
|---|---|---|---|
| `--workspace <DIR>` | `APP_CLI_WORKSPACE` | `/app/code` | workspace 根(含 workspace.manifest.toml + 各子项目) |
| `--log-dir <DIR>` | `APP_CLI_LOG_DIR` | `/app/logs` | 日志根目录(app-cli 自身 + 各服务 runtime.{out,err}.log) |
| `--admin-addr <ADDR>` | `APP_CLI_ADMIN_ADDR` | `0.0.0.0:3010` | 管理 API 监听地址 |
| `--pingap-bin <PATH>` | `APP_CLI_PINGAP_BIN` | `/usr/local/bin/pingap` | pingap 二进制路径(沙箱默认路径已装,一般不用设) |
| `--gen-lock <DIR>` | `APP_CLI_GEN_LOCK` | — | 本地开发模式:只生成 release.lock.toml + 打印配置预览后**退出**,不启动任何服务 |

另有仅本地用的逃生 env(生产禁):`APP_CLI_SKIP_PG_WAIT=1` 跳过 60s PG 等待、
`APP_CLI_SKIP_PINGAP_CONFIRM=1` 跳过启动时的配置生效确认。

### 工作流 1:manifest/路由迭代验证(最常用,零依赖)

```bash
app-cli --gen-lock <workspace根>
```

读 `workspace.manifest.toml` → 自动发现子项目 → manifest 校验(**与平台构建同一套校验规则**;
平台构建另会执行 build 命令、校验 artifact 产物,gen-lock 不涉及) →
生成 `release.lock.toml` 到 workspace 根 → 打印服务清单、端口分配+启动拓扑序、
Pingap 生效配置 TOML 预览。**不依赖 pingap 二进制、PG、镜像**,秒级完成。

验证检查点:

1. 命令无报错 = manifest 校验通过(gen-lock 的报错 = 平台构建时 manifest 校验会报的错)
2. 服务清单 = 预期的 enabled 服务
3. 端口(4000–7999,确定性分配)不与本地已占用端口冲突;拓扑序符合 `depends_on`
4. Pingap 配置预览里 path/rewrite/strip_prefix/upstream 符合路由预期

### 工作流 2:本地完整编排(集成验证)

```bash
APP_CLI_WORKSPACE=<workspace根> \
APP_CLI_LOG_DIR=/tmp/userapp-logs \
app-cli
```

dev 形态(源码态,任一服务配了 `[devrun]` 时本地复现 dev/start 的启动形态):
上述命令加 `APP_CLI_RUN_PROFILE=dev` —— `[devrun].command` 优先、
`[run].command` 兜底(与平台 dev/start spawn 本进程时注入的信号同名)。

启动判定(app-cli builtin 引擎,dev/start·restart 的 SSE 逐服务事件):
- `service_start_ok` = readiness 探测通过(`[health].readiness_path` 在
  `[health].startup_timeout_seconds`(默认 25s,慢启动服务按需调大)窗口内 2xx)
- 单服务失败(migrate/spawn/探测超时)**不阻塞**其余服务;任务终态 failed 的
  error 为逐服务汇总,已启动服务保留运行(dev/list 可查)
- 事件经 stdout `APP-CLI-EVT` 行协议回传任务 SSE(`/tasks/{id}/logs/stream`)
- `type = "static"` 服务(无进程):`[run]` 禁止、`[build].artifact`=静态内容目录
  (如 dist)——内置静态托管 serve(lock 端口,SPA fallback index.html,/health 恒 200),
  启动恒成功(`service_start_ok` 即时);dev 源码态配了 `[devrun]` 时端口让给
  dev server(vite dev 热加载),托管跳过

启动链:等 PG → 逐服务 migrate→start → 编译+`pingap -t` 校验 → 起 pingap(:9080)
→ readiness 判定 → supervise。

- 前置:各服务 `[run].command` 可直接执行;需要构建产物的先本地跑 build 脚本
  (如 Next 模板 `run.command = ["node","server.js"]` 须先 build 出 standalone)
- PG:服务依赖 DB 时须有可达 PG(连接参数读 `PGHOST`/`PGPORT`/
  `POSTGRES_USER`/`POSTGRES_PASSWORD`,默认 localhost:5432 app/app);
  **等 60s 仍不可达则 app-cli 直接报错退出**。无 DB 依赖时用
  `APP_CLI_SKIP_PG_WAIT=1` 跳过等待(**仅本地逃生**,生产禁)
- 退出语义:任一子进程退出或收到 Ctrl-C/SIGTERM → 优雅停掉全部子进程后
  app-cli 退出。**本地手动跑不会自动重启**,要重新运行命令;生产容器里
  由 supervisord 整组重启
- 访问入口 = `http://127.0.0.1:9080/<proxy.path>...`(与生产同构,经反代)
- 入口默认页:workspace 根有 `index.html` 且无服务占 `/` 时,根路径/未匹配路径
  兜底展示它(app-cli 内置静态服务 :9081,每次请求实时读文件,改完刷新即生效);
  catch-all 服务(如 userapp-next 的 `path = "/"`)独占根路由时 index.html 不生效
- 排查看日志:`$APP_CLI_LOG_DIR/app-cli.log.<日期>`(编排日志)+
  `<service_id>/runtime.{out,err}.log`(子服务 stdout/stderr);启动成功后有
  `🔌 运行拓扑` 汇总行,每个 service_id 的 port 与 route 一眼可查

常用管理 API(默认 :3010;JSON 端点响应为 `HttpResult` 信封
`{code,message,data,tid,success}`——探针/effective-config/SSE 豁免):

```bash
curl 127.0.0.1:3010/health                      # liveness(恒 200)
curl 127.0.0.1:3010/ready                       # readiness
curl 127.0.0.1:3010/v1/proxy/status             # 代理状态(data.mode/releaseId/...)
curl 127.0.0.1:3010/v1/proxy/effective-config   # 当前生效 Pingap TOML(豁免信封)
curl 127.0.0.1:3010/v1/proxy/upstreams          # 服务→端口映射(data.upstreams)
```

### 工作流 3:单服务日常开发(不用 app-cli)

正常起 dev server(`PORT=4100 pnpm dev`、`uvicorn main:app --port $PORT` 等),
守住两条平台契约:**监听 `0.0.0.0:$PORT`**、文件日志写 `$APP_LOG_DIR`(本地手动
起时自己 `export APP_LOG_DIR=<目录>`,生产由 app-cli 注入)。
多服务联调或发布前验证再切工作流 1/2。

### Agent 开发规范(本地测试必守)

1. **`release.lock.toml` 是生成产物**——不手改、不提交(本地 gen-lock 的版本/digest
   字段是占位值,与平台构建产物不同)
2. **逃生开关只许本地**——`APP_CLI_SKIP_PG_WAIT`/`APP_CLI_SKIP_PINGAP_CONFIRM`
   只在本地命令行用,不写进 manifest、[env] 或任何部署配置
3. **验证路由/manifest 问题优先工作流 1**(秒级、零依赖);涉及服务真实运行行为
   才上工作流 2
4. **监听契约不变**——本地开发同样不硬编码端口,任何时候监听 `0.0.0.0:$PORT`

---

## 校验规则速查(Fail-Fast)

- schema_version 须为 1;未知字段直接失败
- service_id:DNS-1123,workspace 内唯一
- argv:非空数组,每参数非空不含 NUL
- 路径:artifact/config/glob 禁止绝对路径/`..`;glob 禁含 `/`
- HTTP 路径:以 `/` 开头,不含 `..`/`?`/`#`
- 路由:path 唯一;最多一个 `/`
- worker 不能声明 `[proxy]`
- static 服务禁配 `[run].command`/`[run].migrate`(无进程,整段省略,内置静态托管)
- depends_on:引用已存在且 enabled 的 service_id;不能自依赖/成环
- 新服务启动建表:建表段包单事务并先取 `pg_advisory_xact_lock(424242)`(**跨服务契约 key,勿改**,见任一后端 db 初始化)——PG 的 `CREATE TABLE IF NOT EXISTS` 非原子,多服务并发首启会撞 pg_type 唯一键(23505);drizzle 类运行时迁移用会话级 `pg_advisory_lock` 包整个 migrate(见 userapp-next migrate.ts)
- 至少一个 enabled 服务
- managed 模式不能写 pingap.config

---

## 常见错误排查

| 现象 | 原因 | 怎么改 |
|---|---|---|
| 构建失败 | manifest 校验不过/build 报错/没产出 artifact | 看报错;本地先跑 build 脚本 |
| 激活后不 Ready | health 路径错/服务崩/端口没监听 `$PORT`/DB 连不上 | 看日志面板;确认监听 `$PORT`;health 返 2xx |
| 外部 502/404 | `[proxy].path` 没配/错/没监听 `$PORT` | 确认 path;看日志确认收到请求 |
| 日志面板查不到 | glob 没匹配/日志没写 `$APP_LOG_DIR` | 检查 glob 和写文件路径 |
| 回滚后报错 | 迁移非幂等/schema 不兼容 | 修迁移(幂等+expand/contract) |
| `unknown field` | 拼错字段/多写字段 | 严格模式,只写文档列出的字段 |
| `duplicate proxy path` | 路由重复 | 改唯一 |
| `multiple catch-all routes` | 两个 `/` | 只留一个 |
| `worker must not declare [proxy]` | worker 配了代理 | 删 [proxy] |
| `static service must not declare [run].command` | static 服务配了 [run] 启动/迁移命令 | 删 [run] 段(无进程);要跑进程则 type 改 `node` 等 |
| 报错含 `逃逸出 [proxy].path` 或 `翻译后找不到` | static 产物资源引用与 [proxy] 错配(base/strip_prefix/产物布局) | 构建工具 `base` 设为 `[proxy].path`;`strip_prefix` 与产物布局对齐(`strip=true`+无前缀产物 / `strip=false`+带前缀产物 二选一) |
| `env key is reserved` | [env] 用了 PORT 等 | 换名 |
| gen-lock 报错 | manifest 校验不过(字段/枚举/路由/依赖环) | 按报错逐条改,与平台构建同一套规则 |
| 本地编排起不来 | run.command 需要的产物没构建 / 端口被占用 / PG 60s 未就绪(报错退出) | 先跑 build 脚本;确保 PG 可达或设 `APP_CLI_SKIP_PG_WAIT=1`;看 app-cli.log 与 runtime.{out,err}.log 定位 |

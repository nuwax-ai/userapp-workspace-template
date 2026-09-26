---
name: userapp-dev-guide
description: >
  UserApp 平台开发规范权威指南。当用户在 UserApp workspace 里开发服务、
  写或改 manifest 配置、规划路由、处理健康检查、声明日志、发布部署、回滚、
  排查错误、本地运行验证时使用。覆盖:核心概念、manifest 全字段、校验规则、
  环境变量约定、数据库连接、反向代理与路由(strip_prefix/catch-all/服务互调/入口首页策略)、
  健康探针、日志、发布状态机、版本保留、回滚、迁移约定、database 目录 SQL 自动执行、
  平台 iframe 嵌入、会话 Cookie 与跨域请求兼容、常见错误排查、
  app-cli 本地开发与测试(gen-lock 秒级验证/本地编排运行)。
  触发词:manifest 配置、project.manifest、workspace.manifest、service_id、
  proxy path、strip_prefix、路由、Vite base、多个前端、两个 Vue、catch-all、首页、入口页、导航页、index.html、反代、pingap、健康检查、探针、
  readiness、liveness、SIGTERM、优雅关闭、日志、发布、部署、上线、回滚、
  迁移、migrate、database 目录、自动执行 SQL、建表、表不存在、启动失败、502、404、端口、PORT、环境变量、数据库连接、
  app-cli、gen-lock、release.lock、本地运行、本地验证、本地测试、集成验证。
---

# UserApp 平台开发指南

## 核心概念

**默认技术选型**：新应用需要后端且用户未指定语言时使用 Python（FastAPI）；前后端分离默认 Python + React，初始化显式传 `--backend python --frontend react`，纯后端只传 `--backend python`。用户明确选型优先，已有应用沿用现有技术栈；不为纯前端需求添加后端，明确选择全栈单体时使用 Next.js。下文其他语言的配置示例不改变这一默认约定。

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
3. **端口由平台定** — 当前模板的进程服务保留 `0.0.0.0:$PORT` 监听与健康接口(`PORT` 由平台注入,4000–7999),worker 也一样；static 的 prod 由平台托管。**硬编码端口 = 必错**
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
readiness_path = "/ready"           # 就绪检查路径;查询本身不摘流、不重启
liveness_path = "/health"           # 存活路径声明,不等于失败会重启容器

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
代码一律读环境变量,**不要在 [env] 里覆盖这些**。未注入时初始默认均为 `dev`
(账号/密码/库名;开发沙箱手动执行 SQL:`PGPASSWORD=dev psql -h 127.0.0.1 -U dev -d dev`),
平台注入时以注入值为准。

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
- **SPA prod**：base 与公共路径一致(如 `/react/`)，`strip_prefix = true` 对应 `dist/assets` 布局。
- **Vite devrun**：base 同样为 `/react/`(Vue 为 `/vue/`)，`dev_strip_prefix = false` 保留前缀给 Vite；app-cli ≥ 0.3.7。不能将 dev base 改回 `/`，否则脚本请求逃到域根。修改后同时验证预览脚本、HMR 与 prod 静态资源。
- **Next.js 单体 `/`**:`strip_prefix = false`(自己处理全部路由)

### React/Vue 的 TOML 单一来源

先读目标子项目的 `AGENTS.md` 和 `project.manifest.toml`。新模板的 `vite.config.ts` 调用
`scripts/manifest-routing.mjs`，用 TOML 解析器读取**本模块** `[proxy].path`，统一生成带尾斜杠的 base。
原始 `pnpm dev` 和 `pnpm build` 同样有效，不依赖 RCoder 注入路由变量。文件缺失/解析失败/路径非法直接报错。

- 改公共路径只改 TOML，不写死 Vite base、不另设环境变量或 `--base` 覆盖。保留模板的 health/入口跳转插件。
- 改完后重启 dev 以重新生成代理配置；prod 重新构建发布。不能认为正在运行的 Vite 或已有 dist 已自动更新。
- 两个同类前端用 CLI 分别创建，例如 `admin-web` → `/admin/`、`portal-web` → `/portal/`，不用改 Vite 配置。
- 本模块资源使用 `import.meta.env.BASE_URL`；共享后端仍请求该后端的 `/api/...`。默认 hash router 不需要逐模块改配置。
- 检查每个入口、JS Content-Type、HMR 和 prod 资源；多个同类前端要检查不同页面内容，防止串路由。
- 存量模板不会自动升级。先安装 `smol-toml` 开发依赖、同步 helper 及 Vite/tsconfig 接线，保留业务插件，
  再使用这一规则；完整步骤见 `template-cli docs` 的 `04-pingap-routing.md`。不要只把旧项目 base 改成 `/`。

### 路由规则

- proxy.path 在 workspace 内**唯一**
- 全 workspace**最多一个 `/`**(catch-all,通常给主前端)
- 具体前缀优先于 catch-all 命中
- **worker 不能声明 [proxy]**,但保留内部 HTTP 健康接口；“无公开路由”不等于“无监听”

### 入口首页(index.html)策略

- workspace 根有 `index.html` 且无服务占 `/` 时,根路径/未匹配路径兜底展示它(app-cli 内置
  静态服务实时读文件,改完刷新即生效);服务路由恒优先
- **默认策略 = 保留导航页并个性化**:init 生成的是脚手架占位页(标题=目录名,卡片=模板默认
  文案),每轮开发结束把它更新为应用真实首页——标题=应用名(与 `workspace.manifest.toml`
  的 name 一致),卡片=真实功能名+一句话描述(链接仍指 `[proxy].path`)。多服务、纯后端
  workspace 必用本策略(纯后端时此页是应用唯一门面,至少写清应用名与各 API 用途)
- **可选策略 = 主前端接管 `/`**:仅当用户明确要求"打开即是应用本身"且只有一个主前端时。
  改主前端 `[proxy].path = "/"` 并删除 `index.html`,联动清单(缺一即 404/白屏):
  1. 新 React/Vue 模板的 base 从 TOML 自动读取 `/`，无需另改；存量模板先按上节升级
  2. 前端路由器 base 同步(hash router 不受影响)
  3. `strip_prefix` 保持 true(产物按根路径打包)
  4. 后端 `/api/*` 前缀不受影响,前端调用仍用相对路径
  5. 全 workspace 仍最多一个 `/`;Next.js 单体本就占 `/`,不可再加
- 改完跑 `app-cli gen-lock --workspace .` + 构建——static 服务会自动校验 base/path/
  strip_prefix 与产物布局联动,错配直接报错并给修复指引
- 判定原则:拿不准就留在默认策略;接管 `/` 属路由变更,完成后必须走路由分发验证

### 服务间互调(推荐:走容器内反代)

```typescript
// 前端用相对路径调后端
fetch('/api/go/items')
```
地址固定 `http://127.0.0.1:9080/<proxy.path>/...`,不依赖平台端口。

> `depends_on` 只控制启动顺序,**不是服务发现**——不注入对方地址。

---

## 平台 iframe 嵌入与会话兼容

UserApp 页面默认支持在平台的跨站 iframe 中使用。用户可以自行修改应用的嵌入策略；用户明确要求禁止或限制 iframe 时，按其要求实现并说明平台内嵌预览可能不可用，不把有意的限制当作缺陷或擅自恢复。既有应用有明确的嵌入策略时予以保留；无法区分用户意图与框架默认行为时，先说明冲突再澄清，不直接覆盖。以下兼容要求适用于仍需支持平台嵌入的应用。

- **默认嵌入策略**：应用、静态服务器及自定义 Pingap 插件不得下发阻止平台嵌入的 `X-Frame-Options: DENY/SAMEORIGIN`。如设置 CSP `frame-ancestors`，必须允许实际平台父页面的源（嵌套 iframe 时包含全部祖先源），不能仅设 `'self'` 或 `'none'`。仅在需要配置嵌入白名单时获取实际平台源，不硬编码测试域名；不要仅为满足默认兼容而新增 frame-ancestors 白名单及配置依赖。已有或用户要求的白名单缺少必要配置时明确报告缺项。不要添加强制跳出 iframe 的脚本，也不要为嵌入兼容删除全部 CSP、鉴权或 CSRF 防护。
- **框架默认值**：引入 Helmet、Spring Security 或认证库时检查实际生效的响应头，覆盖与平台嵌入冲突的默认项。Helmet 的 X-Frame-Options 和 CSP frame-ancestors 要分别检查，只调整其中一个不一定足够。
- **应用会话 Cookie**：需要在跨站 iframe 中使用的应用 Cookie 显式设置 `SameSite=None; Secure`，会话 Cookie 保留 `HttpOnly`，核对外部域名下的 Domain/Path；无跨子域共享需求时优先省略 Domain。平台 `ticket` 与应用会话是两套 Cookie，平台不会自动修正应用 Cookie。无会话需求的应用不必新增 Cookie。
- **HTTPS 与代理**：Secure 要求浏览器访问的外部入口使用 HTTPS，不要求 Java、RCoder、Pingap 和应用之间启用 TLS。Express 等框架需按实际代理拓扑配置可信代理，核对应用收到的外部 Host/协议；协议误报为 HTTP 时报告代理链问题，不能通过取消 Secure、伪造协议头或盲目信任所有来源绕过。
- **请求与页面通信**：iframe 内调用本应用 API 优先用相对路径。跨站嵌入本身不等于需要 CORS；确需跨源 fetch 且使用 Cookie 时，客户端带 credentials，响应按实际调用方配置 Origin 白名单和凭据许可，不使用 `Access-Control-Allow-Origin: *` 搭配凭据。父子页面跨源通信使用 `postMessage` 并校验来源，不直接读写对方 DOM。
- **浏览器验证**：新增或修改页面入口、登录、Cookie、代理配置或安全中间件后，通过平台实际 iframe 检查页面、资源、登录后刷新、业务请求及退出（按已有功能验证）。查看文档最终响应和重定向链、Cookie 拒收原因及后续请求是否携带 Cookie；curl 返回 HTML 不能证明 iframe 可用。第三方 Cookie 策略仍可能阻止 `SameSite=None; Secure`，不得以关闭浏览器安全设置作为修复。无法使用真实平台/浏览器时明确记录未验证项。

用户明确选择禁止或限制嵌入时，改为验证约定的拒绝/允许范围和独立访问流程，不要求平台 iframe 必须成功，Cookie 按实际会话使用场景配置，不因禁止嵌入就自动移除 Secure/HttpOnly 或改动 SameSite。

排障时区分：X-Frame-Options/CSP 拒绝嵌入、CORS 请求失败、Cookie 丢失、混合内容、父子页面同源策略，以及上游 502。先记录状态码和完整报错，不把所有白屏都归因于跨域。

## 健康检查

三个健康路径声明不等于三套已装配的容器探针。当前 builtin 在 dev + devrun 时检查 TCP,其他进程检查 `readiness_path` 的 HTTP 2xx；supervisord 使用进程启动确认及可选 workspace bridge。worker 没有自动跳过检查的规则。

| 字段 | 默认路径 | 当前作用 |
|---|---|---|
| **startup_path** | `/health` | 启动健康路径声明,不取代上述实际启动判据 |
| **readiness_path** | `/health` | 对应服务启动检查、web 业务就绪查询和显式 bridge 的健康路径 |
| **liveness_path** | `/health` | 存活路径声明,不意味着失败后自动重启整个容器 |

**建议**:readiness 廉价、只读地检查必要依赖,失败返回非 2xx；liveness 只反映进程本身。业务就绪查询是观察,不会因查询而启动/唤醒服务、摘流或重启容器。

**后台 worker**：用 `template-cli add backend-python --kind worker` 后,保留 FastAPI/Uvicorn 与 `$PORT` 监听,在应用生命周期内启动/停止后台任务。不能把 HTTP 入口改成仅任务循环,不能依据自建需求文档删除健康接口；当前尚未提供无监听纯进程启动策略。worker 不参与 web 可访问性查询,但其启动失败仍会使本次启动操作失败。

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

### database/ 目录 SQL 自动执行

workspace 根 `database/` 与各子项目 `{目录}/database/` 下的 `.sql` 文件,由**平台**在发布
activate 后自动按序执行(容器内 `psql -f`)。规则:

- **顺序**:根 `database/` 先(建库/扩展类),子项目按目录名字典序;目录内按文件名字典序
  (建议 `001_`、`002_` 前缀显式控制)
- **只扫一层**:仅 `database/` 直接子文件,子目录不递归;非 `.sql` 不进发布包
- **文件名白名单 `[A-Za-z0-9._-]`**:中文/空格/特殊字符文件名被**静默跳过**(仅 warn 日志)
- **幂等**:每次发布重跑全部 SQL(无执行记录表),SQL 须自带幂等
  (`CREATE TABLE IF NOT EXISTS`、`ON CONFLICT DO NOTHING`)
- **失败不阻断**:单文件失败仅日志跳过,继续下一文件;`ON_ERROR_STOP=on` 保证文件内原子
- **目标库**:运行容器内 PG(`$POSTGRES_USER`/`$POSTGRES_DB`);执行前等 PG 就绪(≤60s),
  未就绪本轮整体跳过

与 `run.migrate` 的边界:database/ 是**平台**执行、失败仅日志;run.migrate 是 **app-cli**
在服务启动前执行应用自管迁移、失败阻断启动。建库/扩展/平台侧初始化放 database/,
应用 schema 演进走 run.migrate。

> ⚠️ **开发阶段不会自动执行**:本地 devrun / 沙箱调试时 database/ 里的 SQL 不会被跑——
> schema 变更需先手动执行(dbx / psql 连开发库),再同步放入 database/ 随发布生效。
> 完整规则见各 workspace 根 `database/README.md`。

### 优雅关闭

SIGTERM → 等 `shutdown_timeout_seconds`(默认30s) → SIGKILL。服务收到 SIGTERM 应停止接新请求、排空在途、关连接。

---

## app-cli 本地开发与测试

`app-cli` 是平台运行时编排器(生产装在 app-runtime 容器内,替代 start.sh:编排子服务
+ Pingap 反代 + 健康/日志/代理管理 API)。本地开发用它做两件事:
**manifest/路由秒级验证**(`gen-lock`)和**多服务本地集成验证**(编排模式)。
日常单服务编码不需要它——直接 `PORT=xxxx` 起 dev server 即可。

开发沙箱容器内已预装 `app-cli` 和 `pingap`(平台统一版本),命令直接可用,无需安装。

### 命令行参数与环境变量

统一使用 `app-cli <子命令> <参数>`。用 `app-cli --help` 查看命令、`app-cli serve --help` / `app-cli build --help` 查看各自参数。必须显式传 workspace，默认 `/app/code` 不是当前目录。

- `gen-lock --workspace DIR`：校验并生成 lock，不启动服务。
- `build --workspace DIR [--dev] [--deploy-dir DIR] [--only IDS]`：构建与产物组装。
- `serve --workspace DIR`：常驻所有者与管理 API，独立本地运行首选。
- `run --workspace DIR`：直接前台编排入口，供平台开发链路使用；不是绕过所有者的备用启动方式。
- `run-service`：运行时内部入口，普通应用开发不直接调用。

不再支持顶层 `--workspace`、顶层 `--gen-lock`、无子命令启动或 `APP_CLI_GEN_LOCK` 选择动作，也没有 `server` 别名。安装版本不支持时报告版本不匹配，不回退旧语法。

下表中 workspace 适用于 gen-lock/build/serve/run；其余运行参数只属于 serve/run。环境变量值可被命令行覆盖；build 的 `--dev/--deploy-dir/--only` 没有同名环境变量：

| 参数 | env | 默认 | 说明 |
|---|---|---|---|
| `--workspace <DIR>` | `APP_CLI_WORKSPACE` | `/app/code` | workspace 根(含 workspace.manifest.toml + 各子项目) |
| `--log-dir <DIR>` | `APP_CLI_LOG_DIR` | `/app/logs` | 日志根目录(app-cli 自身 + 各服务 runtime.{out,err}.log) |
| `--admin-addr <ADDR>` | `APP_CLI_ADMIN_ADDR` | `0.0.0.0:3010` | 管理 API 监听地址 |
| `--pingap-bin <PATH>` | `APP_CLI_PINGAP_BIN` | `/usr/local/bin/pingap` | pingap 二进制路径(沙箱默认路径已装,一般不用设) |

另有仅本地用的逃生 env(生产禁):`APP_CLI_SKIP_PG_WAIT=1` 跳过 60s PG 等待、
`APP_CLI_SKIP_PINGAP_CONFIRM=1` 跳过启动时的配置生效确认。

### 工作流 1:manifest/路由迭代验证(最常用,零依赖)

```bash
app-cli gen-lock --workspace <workspace根>
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

### 工作流 2:独立本地完整编排(集成验证)

**平台沙箱已有受管实例时，不运行下列命令**：通过平台启动/重启操作与该应用的预览入口验证。端口可达不是应用身份的证明；无法确认实例归属/控制入口时记录受阻。不要重复启动 serve/run、杀占用者、删锁文件或换管理端口绕过所有权保护。

独立环境确认无现有实例，且管理 API、Pingap 与各服务端口无冲突后，在 workspace 根执行：

```bash
app-cli gen-lock --workspace .
app-cli build --workspace . --deploy-dir .local-deploy
app-cli serve --workspace .local-deploy --log-dir .local-logs
```

`.local-deploy/`、`.local-logs/` 加入 `.gitignore`。产物态服务在组装后的目录运行（例如 Next standalone），不要直接在源码根执行依赖产物布局的生产命令。

dev 源码态（替代上述产物态步骤，不同时启动）：

```bash
app-cli gen-lock --workspace . --dev
app-cli build --workspace . --dev
APP_CLI_RUN_PROFILE=dev app-cli serve --workspace . --log-dir .local-logs
```

`[devrun].command` 优先、`[run].command` 兜底；后者依赖的产物须在源码目录可用。

启动判定(app-cli builtin 引擎,dev/start·restart 的 SSE 逐服务事件):
- `service_start_ok` = readiness 探测通过(`[health].readiness_path` 在
  `[health].startup_timeout_seconds`(默认 25s,慢启动服务按需调大)窗口内 2xx)
- 单服务失败(migrate/spawn/探测超时)**不阻塞**其余服务;任务终态 failed 的
  error 为逐服务汇总,已启动服务保留运行(dev/list 可查)
- 事件经 stdout `APP-CLI-EVT` 行协议回传任务 SSE(`/tasks/{id}/logs/stream`)
- `type = "static"` 服务(prod 无业务进程):`[run]` 禁止、`[build].artifact`=静态内容目录
  (如 dist)——内置静态托管 serve(lock 端口,SPA fallback index.html,/health 恒 200),
  启动恒成功(`service_start_ok` 即时);dev 源码态配了 `[devrun]` 时端口让给
  dev server(vite dev 热加载),托管跳过

启动链:等 PG → 逐服务 migrate→start → 编译+`pingap -t` 校验 → 起 pingap(:9080)
→ readiness 判定 → supervise。

- 前置:各服务 `[run].command` 可直接执行;需要构建产物的先本地跑 build 脚本
  (如 Next 模板 `run.command = ["node","server.js"]` 须先 build 出 standalone)
- PG:服务依赖 DB 时须有可达 PG(连接参数读 `PGHOST`/`PGPORT`/
  `POSTGRES_USER`/`POSTGRES_PASSWORD`,默认 localhost:5432 dev/dev——与容器
  PG 初始凭据一致,用户可自行重置,以环境变量实际值为准);
  **等 60s 仍不可达则 app-cli 直接报错退出**。无 DB 依赖时用
  `APP_CLI_SKIP_PG_WAIT=1` 跳过等待(**仅本地逃生**,生产禁)
- `serve` 是常驻控制进程，业务启动失败/停止不等于控制进程退出。通过状态与日志判断业务就绪，不能只看 PID。独立本地验证完成后，只对自己启动的前台所有者发 Ctrl-C；`run` 的直接编排退出行为不能套用到 `serve`。
- 访问入口 = `http://127.0.0.1:9080/<proxy.path>...`(与生产同构,经反代)
- 入口默认页:workspace 根有 `index.html` 且无服务占 `/` 时,根路径/未匹配路径
  兜底展示它(app-cli 内置静态服务 :9081,每次请求实时读文件,改完刷新即生效);
  catch-all 服务(如 userapp-next 的 `path = "/"`)独占根路由时 index.html 不生效
- 排查看日志:`<log-dir>/app-cli.log.<日期>`(编排日志)+
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
- static 服务禁配 `[run].command`/`[run].migrate`(prod 无业务进程,整段省略,内置静态托管；dev 可用 `[devrun]`)
- depends_on:引用已存在且 enabled 的 service_id;不能自依赖/成环
- 新服务启动建表:建表段包单事务并先取 `pg_advisory_xact_lock(424242)`(**跨服务契约 key,勿改**,见任一后端 db 初始化)——PG 的 `CREATE TABLE IF NOT EXISTS` 非原子,多服务并发首启会撞 pg_type 唯一键(23505);drizzle 类运行时迁移用会话级 `pg_advisory_lock` 包整个 migrate(见 userapp-next migrate.ts)
- 至少一个 enabled 服务
- managed 模式不能写 pingap.config

---

## 国内网络与镜像

registry 类依赖的镜像由**环境层**注入(平台沙箱自动配置 / docker ARG,见 docker/Dockerfile),
项目内不硬编码镜像。裸机开发(国内网络)按需自行配置:

| 语言/工具 | 配置 |
|---|---|
| Go | `export GOPROXY=https://goproxy.cn,direct` |
| npm / pnpm | `npm config set registry https://registry.npmmirror.com`(pnpm 同理) |
| pip | `export PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/` |
| cargo | rsproxy(即 docker `CARGO_CN` 写入的 `/usr/local/cargo/config.toml`) |
| maven | wrapper 已内置 aliyun 发行版镜像;依赖可配 aliyun 的 `settings.xml` |

模板已消除的硬编码外网依赖:rust swagger-ui(vendored 内嵌)、next 字体(geist npm 包内置)、
java maven 发行版(aliyun)。新增依赖若构建期需访问 GitHub/Google 等受限站点,优先选随包
分发的离线方案,参照 backend-rust README「构建与网络」。

---

## 常见错误排查

| 现象 | 原因 | 怎么改 |
|---|---|---|
| 构建失败 | manifest 校验不过/build 报错/没产出 artifact | 看报错;本地先跑 build 脚本 |
| 构建失败:GitHub 直连超时(utoipa-swagger-ui 下载 swagger-ui) | 依赖的 build.rs 构建期从 GitHub 拉资源,沙箱禁直连 | 模板已启用 `vendored` 免下载;新增此类依赖优先离线 feature,或下载 URL 前拼沙箱注入的 `GITHUB_MIRROR_URL`(须为带 `dist/` 的 GitHub tag archive),见 backend-rust README「构建与网络」 |
| 构建失败:Google Fonts 拉取超时(next/font) | `next/font/google` 构建期从 Google 下载字体 | 模板已用 geist npm 包内置字体;新页面勿用 `next/font/google`,选随包分发的字体包 |
| 激活后不 Ready | health 路径错/服务崩/端口没监听 `$PORT`/DB 连不上 | 看日志面板;确认监听 `$PORT`;health 返 2xx |
| 外部 502/404 | `[proxy].path` 没配/错/没监听 `$PORT` | 确认 path;看日志确认收到请求 |
| 日志面板查不到 | glob 没匹配/日志没写 `$APP_LOG_DIR` | 检查 glob 和写文件路径 |
| 回滚后报错 | 迁移非幂等/schema 不兼容 | 修迁移(幂等+expand/contract) |
| 发布后 SQL 没执行/表不存在 | 文件名含中文/空格(白名单 `[A-Za-z0-9._-]` 外被跳过)、SQL 不在 `database/` 直接子层、或单文件报错被跳过 | 文件名改白名单字符并放 `database/` 一级;看部署日志 `database sql` 段的 failed 列表;修好重新发布 |
| 开发/本地运行报表不存在 | `database/` SQL 只在发布 activate 后自动执行,开发阶段不会跑 | 手动执行(dbx/psql 连开发库)后再起服务;应用 schema 演进改走 `run.migrate` |
| `unknown field` | 拼错字段/多写字段 | 严格模式,只写文档列出的字段 |
| `duplicate proxy path` | 路由重复 | 改唯一 |
| `multiple catch-all routes` | 两个 `/` | 只留一个 |
| `worker must not declare [proxy]` | worker 配了代理 | 删 [proxy] |
| `static service must not declare [run].command` | static 服务配了 [run] 启动/迁移命令 | 删 [run] 段(prod 内置静态托管，dev 可用 `[devrun]`);prod 要跑业务进程时 type 改 `node` 等 |
| 报错含 `逃逸出 [proxy].path` 或 `翻译后找不到` | static 产物资源引用与 [proxy] 错配(base/strip_prefix/产物布局) | 构建工具 `base` 设为 `[proxy].path`;`strip_prefix` 与产物布局对齐(`strip=true`+无前缀产物 / `strip=false`+带前缀产物 二选一) |
| `env key is reserved` | [env] 用了 PORT 等 | 换名 |
| gen-lock 报错 | manifest 校验不过(字段/枚举/路由/依赖环) | 按报错逐条改,与平台构建同一套规则 |
| 本地编排起不来 | run.command 需要的产物没构建 / 端口被占用 / PG 60s 未就绪(报错退出) | 先跑 build 脚本;确保 PG 可达或设 `APP_CLI_SKIP_PG_WAIT=1`;看 app-cli.log 与 runtime.{out,err}.log 定位 |

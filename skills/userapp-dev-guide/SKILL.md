---
name: userapp-dev-guide
description: >
  开发、接入或排查 UserApp workspace 时使用：已有 ZIP/Git/业务代码适配、平台源码根与嵌套工程修正、
  manifest、服务路由、worker 探测、数据库迁移、日志、iframe、发布恢复及 app-cli 本地验证。
  导入适配保留原技术栈和业务，按需读取 references/import-existing-project.md；
  创建 workspace 或追加模板的 CLI 用法见 userapp-scaffold。
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

## 源码根与运行目录

平台工作区契约（文件/chat 接口实际返回的 `workspace_root`）决定唯一源码根；先核对当前 cwd 与该根一致，再记录 `SOURCE_WORKSPACE=$PWD`。此后初始化、根 manifest、构建和配置校验都使用这个固定源码根。进入服务目录后不重新赋值；新 shell 恢复已记录的路径。平台预建的空 `code/`、`state/`、`builds/`、`.run/` 属于预留或派生目录，不是让 agent 再建 workspace 的目标。独立客户端可按用户选择 `init <dir>` 新建，进入该目录后记录自己的源码根。

仅有 Git/agent 元数据、用户说明或平台预建空目录的新 workspace 可在原根初始化。旧版 CLI 非空拒绝时，在工作区外临时生成后最小合入原根，保留已有文件；不要使用 force 或把完整工程留在下一层。`code/` 内已有完整业务时按下面的适配指引接入原根，不重新脚手架化，也不拿子目录 validate 通过替代平台根检查。

## 导入已有项目

已有 ZIP 解压内容、Git 项目或业务代码需要接入 UserApp 时，**先读本技能的[导入适配指引](references/import-existing-project.md)**。根 manifest 已存在但新增模块尚未接入时，同样使用该流程。

模板提供初始化起点，用户项目可以自由演进。沿用其实际语言、框架、目录和构建命令，只适配平台运行契约；不要求与模板同构，也不因新增模块或改动构建入口而重建项目。

先盘点实际服务和依赖 → 保留原结构并安排一级服务目录 → 补齐真实构建、产物、启动、探测和路由 → 核对 `app-cli validate --help` 后用 `app-cli validate --workspace "$SOURCE_WORKSPACE"` 对原根只读校验（旧版兼容检查见导入指引） → 实际构建和访问验证。不要在业务目录使用 `init --force`，不改写技术栈或覆盖用户 AGENTS。没有业务代码的新项目才交给 scaffold；元数据或预建空目录不代表已有业务。

找不到本地 reference 时执行 `template-cli docs`，阅读列出的 `07-import-existing-project.md`；平台草稿检测仅是辅助，不代表项目已经适配。

## 六条铁律

1. **两级 Manifest** — 根目录 `workspace.manifest.toml`，每个参与编排的一级服务目录有 `project.manifest.toml`。普通 docs/packages/scripts 目录无需 manifest；平台只扫描一级服务目录，**只认**这两个确切文件名
2. **严格校验,Fail Fast** — 未知字段、非法枚举、重复路由、依赖环 → 构建立即失败。每段 `deny_unknown_fields`
3. **端口由平台定** — HTTP/TCP 进程监听 `0.0.0.0:$PORT`(`PORT` 由平台注入,4000–7999),HTTP worker 保留健康接口；process worker 不要求监听；static 的 prod 由平台托管
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
artifact = "artifact.zip"           # 必填,服务内相对路径；进程服务为部署 ZIP，static 为内容目录

[devbuild]                          # 可选,dev阶段编译/准备命令(依赖安装/type-check等,不要求产artifact)
command = ["pnpm", "run", "type-check"]  # 仅配了[devrun]的源码态dev链路生效。缺省三分派:只配[devrun]
                                    # 的服务跳过编译(devrun自足不消费产物);未配[devrun]回落[build].command

[run]
command = ["./server"]              # 进程态必填；本例 HTTP 服务监听 0.0.0.0:$PORT
migrate = ["./migrate"]             # 可选,启动前按拓扑序执行,必须幂等
depends_on = ["worker"]             # 可选,控制启动顺序
shutdown_timeout_seconds = 30       # 可选,默认30

[devrun]                            # 可选,dev阶段热加载启动;缺省回落[run].command
command = ["pnpm", "exec", "vite"]  # 配置即切源码态且声明dev态自足(未配[devbuild]则跳过编译):
                                    # dev/start·restart编译([devbuild]显式配置则执行)后
                                    # app-cli >= 0.3.16 经唯一 serve owner 编排源码 workspace,不部署.run;
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

进程服务的部署 ZIP 会被展开到服务运行目录，`run.command` 须与展开后的布局一致。Java 使用 `java -jar target/...jar` 时，需要保留该 JAR 文件；直接把它声明为 artifact 会展开其内容而不保留原文件，推荐按原路径放进外层部署 ZIP。也可有意使用展开式 JAR 布局，以该 Spring Boot 版本实际包含的 Launcher 或明确的主类、classpath 和依赖入口启动。已有项目的源码、配置、制品一致且实际可运行时保留其方案，不按 `.jar` 扩展名一概判错或强制包装；见[Java 布局与包装示例](references/import-existing-project.md#java-保留原生构建与启动路径)。

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
| `PORT` | 平台分配的端口(4000–7999) | HTTP/TCP 进程监听 `0.0.0.0:$PORT`；process worker 不要求监听 |
| `HOSTNAME` | `0.0.0.0` | 绑到它 |
| `APP_LOG_DIR` | 当前服务的实际日志目录 | 日志文件写进这里，不拼接固定容器路径 |
| `APP_SERVICE_ID` / `APP_RELEASE_ID` | 本服务身份 | 需要时读取 |

禁止 key:`PORT`/`HOST`/`HOSTNAME`/`APP_LOG_DIR`/`APP_SERVICE_ID`/`APP_RELEASE_ID`,以及 `RCODER_` 开头。

### 工作目录与持久目录

| 定位方式 | 内容 |
|---|---|
| 平台提供的 workspace / 服务命令的 cwd | 当前源码或部署后的服务产物；文件使用相对路径 |
| 平台挂载的持久数据目录 | PG 等持久数据，以实际挂载及 `PGDATA` 配置为准 |
| `$APP_LOG_DIR` | 当前 service 的文件日志目录 |

RCoder UserApp 容器当前以 `/home/user` 为挂载根，独立 app-cli 的 workspace/log-dir 由调用方指定。
运行目录由实际 `--workspace`、`APP_CLI_WORKSPACE` 或启动 cwd 确定，日志目录使用实际配置；不要把旧版 `/app/code`、日志默认 `/app/logs` 当成所有部署的固定布局，也不根据 user_id/conversation_id 拼路径。

### 数据库(PostgreSQL)

RCoder UserApp 容器自带 PG，通常为同容器 `localhost:5432`。连接参数按模板的解析逻辑读取实际
`DATABASE_URL` 或 PG 环境变量；平台注入凭据优先，不用 manifest 中的旧值覆盖。
`dev/dev/dev` 是初次初始化默认值，不代表用户改密后的有效凭据。

独立 app-cli 不自带数据库，也不因 manifest 有 migrate 就强制探测 PG。RCoder 通过
`APP_CLI_REQUIRE_PG=1` 启用前置等待；独立运行时由用户/客户端准备数据库并决定是否启用，
支持远程主机和自定义端口。详见随 CLI 分发的「Manifest 字段参考」PG 环境策略。

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
- **worker 不能声明 [proxy]**；HTTP worker 保留内部健康接口，纯进程 worker 必须显式声明 startup_probe；“无公开路由”不等于“无监听”

### 入口首页(index.html)策略

- workspace 根有 `index.html` 且无服务占 `/` 时,根路径/未匹配路径兜底展示它(app-cli 内置
  静态服务实时读文件,改完刷新即生效);服务路由恒优先
- **默认策略 = 保留导航页并个性化**:init 生成的是脚手架占位页(标题=目录名,卡片=模板默认
  文案),初始化和导航变化后把它更新为应用真实首页——标题=应用名(与 `workspace.manifest.toml`
  的 name 一致),卡片=真实功能名+一句话描述(链接仍指 `[proxy].path`)。多服务、纯后端
  workspace 可用本策略(纯后端时至少写清应用名与各 API 用途)
- **可选策略 = 主前端接管 `/`**:按用户需求选择，主前端可与其他具体前缀服务共存。
  改主前端 `[proxy].path = "/"` 后根 `index.html` 不再作为兜底，不要求创建、修改或删除它。联动检查：
  1. 新 React/Vue 模板的 base 从 TOML 自动读取 `/`，无需另改；存量模板先按上节升级
  2. 前端路由器 base 同步(hash router 不受影响)
  3. `strip_prefix` 保持 true(产物按根路径打包)
  4. 后端 `/api/*` 前缀不受影响,前端调用仍用相对路径
  5. 全 workspace 仍最多一个 `/`;Next.js 单体本就占 `/`,不可再加
- 改完按下文校验工作流运行 `app-cli validate --workspace "$SOURCE_WORKSPACE"`（dev 另加 `--dev`；先核对安装能力），再实际构建并检查页面、JS/CSS 资源 URL、Content-Type 与深链接；dev 还需验证 HMR。配置和构建命令成功不能替代 base/path/strip_prefix 与真实产物路由的访问验证
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

三个健康路径声明不等于三套已装配的容器探针。未声明 startup_probe 时 builtin 在 dev + devrun 时检查 TCP,其他进程检查 `readiness_path` 的 HTTP 2xx；supervisord 使用进程启动确认及可选 workspace bridge。worker 没有自动跳过检查的规则。

| 字段 | 默认路径 | 当前作用 |
|---|---|---|
| **startup_path** | `/health` | 启动健康路径声明,不取代上述实际启动判据 |
| **readiness_path** | `/health` | 对应服务启动检查、web 业务就绪查询和显式 bridge 的健康路径 |
| **liveness_path** | `/health` | 存活路径声明,不意味着失败后自动重启整个容器 |

**建议**:readiness 廉价、只读地检查必要依赖,失败返回非 2xx；liveness 只反映进程本身。业务就绪查询是观察,不会因查询而启动/唤醒服务、摘流或重启容器。

**后台 worker**：用 `template-cli add backend-python --kind worker` 后,保留 FastAPI/Uvicorn 与 `$PORT` 监听,在应用生命周期内启动/停止后台任务。不能把 HTTP 入口改成仅任务循环,不能依据自建需求文档删除健康接口；纯进程需求使用 `worker-python` 并显式 `startup_probe="process"`，前提是 app-cli >= 0.3.9 且 owner 声明 `startup-probe-v1`；配套版本未发布或不可确认时继续使用 HTTP worker。worker 不参与 web 可访问性查询,但其启动失败仍会使本次启动操作失败。

workspace 级桥接(可选):`[health].bridge_service = "api"` 让 app-cli `/ready` 反映该服务就绪状态；
是否影响容器 Ready/流量取决于部署是否将它接入探针，不能仅凭 manifest 断言摘流。`/health` 仍用于管理进程存活。

---

## 构建与启动失败

业务启动失败先查看实际 `service_id` 的 stdout/stderr 和服务日志，核对本次部署目录、启动命令及入口文件。`Unable to access jarfile` 等明确文件错误应追踪真实新 ZIP 的布局，不能仅凭源码目录内文件存在判断运行产物完整。

平台返回结构化诊断时，先按 `repair_target` 决定修复归属：`project` 按文件/字段增量修正；`platform` 使用平台恢复入口并保留原操作身份。原根与服务配置正确、owner 错指子目录时，不搬源码或改平台环境变量，不删除 owner 状态/锁、不用 pkill 解锁。常规非破坏性项目修正自行完成，保留用户代码、Git、依赖锁、共享依赖及平台状态。

即使受理失败，也读取 `data.task_id`（工具封装可能为 `error.data.task_id`）回查任务 GET/SSE；`scope=task` 对应任务的 `workspace` 日志，`scope=service` 用实际 `service_id`。修正后回原根 `validate --dev --json`、核对预期服务，再实际构建、启动并验证访问。接口、空 task_id 和字段说明见 [失败任务与诊断](references/import-existing-project.md#失败任务与诊断)。

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
构建 → release.lock.toml → 发布包 → 下载校验/切换代码 → 服务编排 → 查询业务就绪
                                                        ↓
                                              失败时查询具体阶段与恢复状态
```

| 观察面 | 含义 |
|---|---|
| 制品部署段 `deploy_stage` | 只说明制品激活结果，成功不等于业务 Ready |
| app-cli `phase` | `idle/deploying/orchestrating/running/failed`，表示编排阶段 |
| 业务就绪 `data.ready` | 只读查询当前 web 服务与入口，不唤醒应用 |
| 操作与恢复状态 | 按 operation ID 核对结果；副作用未知时继续原操作的恢复流程 |

`failed` 不表示旧版本已恢复运行。已确认激活后的启动失败可能仍保留新版本；真实清理或平台数据库写入结果未知时
需要恢复，不能删 journal、清锁或换新身份重复执行。保留具体错误与操作 ID，使用平台支持的恢复入口。

### 回滚

回滚 = 重新激活历史保留版本。**回滚不执行数据库 down migration**。

### 版本保留

历史制品保留策略以平台版本管理为准。回滚前核对制品可用性，不手工删除运行目录或 journal。

### 数据库迁移约定

`run.migrate` 启动前按拓扑序执行；app-cli >= 0.3.16 仅在迁移进程/后代退出与清理已确认后，对应用迁移失败记录具体阶段、错误和输出并继续启动，历史回执仅诊断。执行锁仍保持互斥；父 Stop/取消、清理未确认及迁移或平台 DBAdmin 的不可逆写入结果未知保持对应保护，不自动重放未知写入。必须:
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
- **失败不阻断**:单文件失败记录后继续下一文件；`ON_ERROR_STOP=on` 只停止当前文件，
  不自动回滚此前已提交语句。需要文件级原子性时显式设计事务，不能把不能在事务中执行的建库语句一起包入
- **目标库**:运行容器内 PG(`$POSTGRES_USER`/`$POSTGRES_DB`);执行前等 PG 就绪(≤60s),
  未就绪本轮整体跳过

与 `run.migrate` 的边界:database/ 是**平台**执行、失败仅日志;run.migrate 是 **app-cli**
在服务启动前执行应用自管迁移；app-cli >= 0.3.16 仅在退出与清理已确认后将普通迁移失败作为告警继续启动，父取消或结果未知保持保护。建库/扩展/平台侧初始化放 database/,
应用 schema 演进走 run.migrate。

> ⚠️ **开发阶段不会自动执行**:本地 devrun / 沙箱调试时 database/ 里的 SQL 不会被跑——
> schema 变更需先手动执行(dbx / psql 连开发库),再同步放入 database/ 随发布生效。
> 完整规则见各 workspace 根 `database/README.md`。

### 优雅关闭

app-cli >= 0.3.16 的交互 Stop/Restart/取消：SIGTERM → 有效优雅退出宽限不超过 3 秒 → 必要时强制清理并核验退出。`shutdown_timeout_seconds` 的 schema 默认 30、必须 > 0 保留，但调大字段不能延长交互停止的上限。服务立即停止接新请求、尽快排空在途并关闭连接；长任务使用持久检查点与幂等续执行。

Stop 取消启动意图、确认业务停止后保留 `serve` 管理面，旧构建及迟到回调不能重新拉起业务。没有业务执行时重复 Stop 幂等成功；用户已停止的业务不因状态/readiness/恢复管理面而启动。3 秒不是整个构建、RPC 或恢复的预算，各阶段共享父请求 deadline；取消受理不代表清理已完成。

---

## app-cli 本地开发与测试

`app-cli` 是平台运行时编排器(生产装在 app-runtime 容器内,替代 start.sh:编排子服务
+ Pingap 反代 + 健康/日志/代理管理 API)。本地开发用它做两件事:
**manifest/路由只读配置检查**(`validate`)和**多服务本地集成验证**(编排模式)。`gen-lock` 保留生成派生 lock 的职责。
日常单服务编码不需要它——直接 `PORT=xxxx` 起 dev server 即可。

开发沙箱容器内已预装 `app-cli` 和 `pingap`(平台统一版本),命令直接可用,无需安装。

### 命令行参数与环境变量

统一使用 `app-cli <子命令> <参数>`。用 `app-cli --help` 查看命令、`app-cli serve --help` / `app-cli build --help` 查看各自参数。新版 workspace 优先级为显式 `--workspace` → `APP_CLI_WORKSPACE` → 启动时当前目录 `.`；旧版本可能仍默认 `/app/code`，以安装版 help 为准。平台开发始终显式传 `--workspace "$SOURCE_WORKSPACE"`，避免进入服务子目录后 cwd 漂移；生产入口按平台提供的运行目录显式启动。

- `validate --workspace DIR [--dev] [--json]`：只读检查源码配置，不生成 lock、不构建、不启动服务；先用 `app-cli validate --help` 核对安装能力。
- `gen-lock --workspace DIR`：校验并生成派生 lock，不启动服务。
- `build --workspace DIR [--dev] [--deploy-dir DIR] [--only IDS]`：构建与产物组装。
- `serve --workspace DIR`：常驻所有者与管理 API，独立本地运行首选。
- `run --workspace DIR`：app-cli >= 0.3.16 通过统一 owner 控制链向独立持久 `serve` 提交源码启动操作；已有核验为同应用的 owner 时复用，没有 owner 时取得稳定内核锁后启动管理服务并恢复。不是另一套前台编排，也不能绕过持锁 owner。
- `run-service`：运行时内部入口，普通应用开发不直接调用。

不再支持顶层 `--workspace`、顶层 `--gen-lock`、无子命令启动或 `APP_CLI_GEN_LOCK` 选择动作，也没有 `server` 别名。安装版本不支持时报告版本不匹配，不回退旧语法。

下表中 workspace 适用于 validate/gen-lock/build/serve/run；其余运行参数只属于 serve/run。环境变量值可被命令行覆盖；build 的 `--dev/--deploy-dir/--only` 没有同名环境变量：

| 参数 | env | 默认 | 说明 |
|---|---|---|---|
| `--workspace <DIR>` | `APP_CLI_WORKSPACE` | `.`（启动 cwd；旧版以 help 为准） | workspace 根(含 workspace.manifest.toml + 各子项目) |
| `--log-dir <DIR>` | `APP_CLI_LOG_DIR` | `/app/logs` | 日志根目录(app-cli 自身 + 各服务 runtime.{out,err}.log) |
| `--admin-addr <ADDR>` | `APP_CLI_ADMIN_ADDR` | `0.0.0.0:3010` | 管理 API 监听地址 |
| `--pingap-bin <PATH>` | `APP_CLI_PINGAP_BIN` | `/usr/local/bin/pingap` | pingap 二进制路径(沙箱默认路径已装,一般不用设) |

另有仅本地用的逃生 env(生产禁):`APP_CLI_SKIP_PG_WAIT=1` 跳过 60s PG 等待、
`APP_CLI_SKIP_PINGAP_CONFIRM=1` 跳过启动时的配置生效确认。

### 工作流 1:manifest/路由只读校验

先用 `app-cli validate --help` 核对安装能力；支持时检查已记录的源码根，平台不得改用 `code/` 或 `.run/`：

```bash
app-cli validate --workspace "$SOURCE_WORKSPACE"
# 有开发运行方式时另检 dev 代理规则
app-cli validate --workspace "$SOURCE_WORKSPACE" --dev
# 需要机器读取报告时
app-cli validate --workspace "$SOURCE_WORKSPACE" --json
```

读取当前源码 manifest → 发现一级服务 → 校验字段、依赖、端口分配和对应 profile 的代理规则。
不生成 lock，不启动 owner，不执行项目命令；旧 lock 不作为本轮权威。生产必填规则不因 `--dev` 放宽。
某些 custom 配置的静态 hostname 会触发 DNS；检查不保证完全离线或秒级完成。

验证检查点:

1. 退出码 `0` 配置通过；`1` 配置错误；`2` 参数错误；`3` 观察/内部失败，不能将其误报为项目非法。
2. 核对预期服务与实际发现清单；`services_complete=false` 表示未完整读取，不能按部分清单声称全部通过。
3. 端口分配、依赖与 profile 路由符合预期；配置检查不检测实际端口占用或上游可达性。
4. 配置通过后仍需构建、运行和真实业务访问；缺少 dist/zip 或尚未安装依赖不作为配置失败。

未提供 validate 的旧版兼容检查按[导入指引](references/import-existing-project.md)使用既有 gen-lock，并明确它会写派生 lock；不能静默替换平台二进制，也不以新命令缺失拦截用户启动/停止。
需要查看完整 Pingap 配置预览或准备本地编排时，仍使用 `gen-lock --workspace DIR` 生成 lock。

### 工作流 2:独立本地完整编排(集成验证)

**平台沙箱已有受管实例时，不运行下列命令**：通过平台启动/重启操作与该应用的预览入口验证。端口可达不是应用身份的证明；无法确认实例归属/控制入口时记录受阻。不要重复启动 serve/run、杀占用者、删锁文件或换管理端口绕过所有权保护。

独立环境确认无现有实例，且管理 API、Pingap 与各服务端口无冲突后，在 workspace 根执行：

```bash
app-cli gen-lock --workspace .
app-cli build --workspace . --deploy-dir .local-deploy
app-cli serve --workspace .local-deploy --log-dir .local-logs
```

`.local-deploy/`、`.local-logs/` 由 init 生成的根 `.gitignore` 忽略（存量 workspace 没有根 `.gitignore` 时手动加入）。产物态服务在组装后的目录运行（例如 Next standalone），不要直接在源码根执行依赖产物布局的生产命令。

dev 源码态（替代上述产物态步骤，不同时启动）：

```bash
app-cli gen-lock --workspace . --dev
app-cli build --workspace . --dev
APP_CLI_RUN_PROFILE=dev app-cli serve --workspace . --log-dir .local-logs
```

`[devrun].command` 优先、`[run].command` 兜底；后者依赖的产物须在源码目录可用。

启动判定(app-cli builtin 引擎,dev/start·restart 的 SSE 逐服务事件):
- `service_start_ok` = 本次启动检查通过；策略由 `startup_probe` 决定，省略保持旧行为。process 仅证明根进程连续存活，不证明业务初始化成功；服务仍须自行在初始化失败时非零退出。
- app-cli >= 0.3.16 的应用 migrate 失败仅在进程/后代退出与清理已确认后告警并继续；父取消、清理未确认及未知不可逆写入仍受保护。业务入口 spawn/探测超时等启动失败会记录具体服务和原因；`serve` owner 的启动操作失败时收束已启动的业务进程，不能将部分 `service_start_ok` 当作任务完成。
- 事件经 owner 事件接口或 stdout `APP-CLI-EVT` 行协议回传任务 SSE(`/tasks/{id}/logs/stream`)，以对应操作的终态为准。
- `type = "static"` 服务(prod 无业务进程):`[run]` 禁止、`[build].artifact`=静态内容目录
  (如 dist)——内置静态托管 serve(lock 端口,SPA fallback index.html,/health 恒 200),
  托管启动成功后才记录启动结果，还需验证真实资源访问；dev 源码态配了 `[devrun]` 时端口让给
  dev server(vite dev 热加载),托管跳过

启动链:按环境策略等待 PG → 逐服务 migrate→start → 编译+`pingap -t` 校验 → 起 pingap(:9080)
→ readiness 判定 → supervise。

- 前置:各服务 `[run].command` 可直接执行;需要构建产物的先本地跑 build 脚本
  (如 Next 模板 `run.command = ["node","server.js"]` 须先 build 出 standalone)
- PG:仅运行环境声明 `APP_CLI_REQUIRE_PG=1` 才做前置探测，独立 app-cli 默认不等待；
  服务自身仍需正确处理所需数据库。启用探测时使用实际连接目标与凭据，等待失败使本次启动操作失败，
  不等于常驻 `serve` owner 退出。无 DB 的独立应用不需要设置跳过开关；
  `APP_CLI_SKIP_PG_WAIT` 仅用于明确的本地诊断，不代替正确的环境策略与连接配置。
- `serve` 是常驻控制 owner，业务启动失败/停止不等于管理进程退出。`run` 客户端提交与查询原操作，客户端退出不能当作业务或 owner 已退出的证据。通过原 operation ID、状态和实际日志判断业务就绪；独立本地验证完成后，业务 Stop 保留管理面，只有明确结束自建前台 owner 时才对该实例发 Ctrl-C。
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

HTTP/TCP 服务正常起 dev server(`PORT=4100 pnpm dev` 等)，监听 `0.0.0.0:$PORT`；
process worker 按其命令前台运行，检查任务行为与失败退出，不补无用途的 HTTP 接口。
文件日志写 `$APP_LOG_DIR`(本地手动起时指定可写目录，生产由 app-cli 注入)。
多服务联调或发布前验证再切工作流 1/2。

### Agent 开发规范(本地测试必守)

1. **`release.lock.toml` 是生成产物**——不手改、不提交(本地 gen-lock 的版本/digest
   字段是占位值,与平台构建产物不同)
2. **逃生开关只许本地**——`APP_CLI_SKIP_PG_WAIT`/`APP_CLI_SKIP_PINGAP_CONFIRM`
   只在本地命令行用,不写进 manifest、[env] 或任何部署配置
3. **验证路由/manifest 问题优先工作流 1**(只读配置检查，custom hostname 可能需要 DNS);涉及服务真实运行行为
   才上工作流 2
4. **按探测策略验证**——HTTP/TCP 进程不硬编码监听端口；process worker 验证根进程与任务行为；prod 静态形态验证资源响应

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
- **本仓 PG 模板的共享初始化**:建表段包单事务并先取 `pg_advisory_xact_lock(424242)`（模板之间的契约 key，勿随意改）；PG 的并发建表需防 pg_type 唯一键冲突。模板 Drizzle 迁移沿用 migrate.ts 的锁保护。导入项目保留原数据库与可靠并发迁移机制，不强制替换成 PG、Drizzle 或这把模板锁。
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
| validate 报错 | 配置错误或观察/内部失败 | 按退出码与诊断区分原因；不使用旧 lock 冒充通过 |
| gen-lock 报错 | manifest/代理配置检查失败 | 按报错修复；失败可能仍保留旧 lock，不沿用旧结果 |
| 本地编排起不来 | run.command 产物缺失 / 端口占用 / 已启用的 PG 前置探测失败 | 先看操作状态与日志；核对构建产物、端口所属实例、`APP_CLI_REQUIRE_PG` 和真实连接参数；不要把 owner 存活当作业务已启动 |

### Python 构建依赖缓存

Python 后端沿用模板 `scripts/build-standalone.sh`（调用配套 Python 构建脚本）。修改依赖时同步 `requirements.lock`；不要在每次构建前删除 `deps/` 或 `.pip-cache/`。构建脚本按锁文件与 Python ABI/平台判断是否重装，缓存保留在子项目工作区。不要将 `.pip-cache/`、`.deps-stamp` 打进制品，也不要把 `PIP_NO_CACHE_DIR=0` 当作开启缓存。生成发布 ZIP 必须重建，避免已删除文件残留。

### 生产运行资源与打包

全部 8 个模板适用；Python 是共享打包工具的实现语言，与业务语言无关。文件静态校验仅识别结构明确的相对本地可执行文件、已识别解释器的直接文件入口及 `java -jar`；不猜测任意 argv 数据参数，不解析 shell `-c`、解释器 `-c`/`-m` 或带选项的复杂命令，其他依赖通过真实制品隔离执行验证。

新增模块、`scripts/`、运行资源时核对实际生产 ZIP/目录，不能仅在源码态运行成功。模板 Python/worker 默认收集未排除资源；编译型与 Next 保留其编译/standalone 运行边界并收集资源，static 只使用 dist。共享 helper 依赖 Python 3.11+，存量应用须一起更新 helper 和构建入口。`.artifactignore` 仅增加相对 glob 排除，私有文件不允许包含回退；构建失败保留旧有效 ZIP。默认排除私有环境/凭据、VCS/agent 状态、缓存、日志、临时和旧制品；已知编译源码树不作为运行资源，新增资源应进入真实输出边界。

修改 build/run 后，从本次真实新 ZIP 或目录制品组装隔离运行目录，核对生产 run/migrate 入口及其依赖，再使用安全测试数据库执行必要迁移和启动，验证真实页面/API/worker 行为。源码态成功、ZIP 存在或历史制品通过不能替代这一步；不要因 run.migrate 为告警策略而接受缺失脚本的发布包。这是开发验证要求，不新增历史状态、模板版本或验证记录的启动门禁。

Next 生产构建依据显式 `packageManager` 或唯一现有 npm/pnpm 锁选择已安装工具；有锁时 npm ci 或 pnpm frozen install，双锁未选或所选锁缺失但存在其他有效锁明确诊断。两种锁均缺失时保留原首次初始化，明确记录生成锁并在后续构建复用。React/Vue 保留原 pnpm 安装契约。存量 Next 项目同步 `scripts/install-locked.mjs` 与入口；不自动升级管理器。

### 静态产物准备和入口文件

静态 React/Vue 构建完成后使用 `python3 scripts/artifact_pack.py --prepare-dir dist --required index.html` 准备**实际将被平台包装的目录**：排除私有/缓存/`.artifactignore` 条目，物化目录内安全链接，越界或循环失败。随后 `--check-dir dist` 仅作严格只读检查；含被排除条目、未物化链接或目录冒充 `index.html` 时失败。准备期间输入文件或目录变化则失败并保留当前原输出；准备过程使用独立 staging 并在发布失败时恢复原 `dist`；恢复本身失败时保留唯一 `.artifact-backup-*` 及具体诊断，不能把唯一有效备份删掉。只处理派生输出，不搬迁业务源码。

结构明确的本地可执行入口、解释器直接文件入口和 `java -jar` 的 JAR 必须为普通文件；本地可执行入口还须有执行位。资源目录的 required 规则仍允许目录，不能用该规则替代命令文件检查。CLI 生成项目保留文本脚本的原权限，新增脚本后仍需验证真实新制品的直接运行。

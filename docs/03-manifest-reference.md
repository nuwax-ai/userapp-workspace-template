# Manifest 完整字段参考

这篇是 `workspace.manifest.toml` 和 `project.manifest.toml` 的**权威字段参考**。每个字段的
**类型、是否必填、默认值、说明**都在这里,并配有**带逐行注释的完整示例**。

> 写配置时,优先参考这篇。两个 manifest 都是**严格模式**(`deny_unknown_fields`):多写一个没列在这里
> 的字段会直接报错。不确定某个字段是不是该写,查这篇。

---

## 目录

- [一、`workspace.manifest.toml`](#一workspacemanifesttoml)
  - [完整示例(带注释)](#完整示例带注释)
  - [字段表](#字段表)
- [二、`project.manifest.toml`](#二projectmanifesttoml)
  - [完整示例(带注释)](#完整示例带注释-1)
  - [字段表:`[project]`](#字段表project)
  - [字段表:`[build]`](#字段表build)
  - [字段表:`[devbuild]`](#字段表devbuild)
  - [字段表:`[run]`](#字段表run)
  - [字段表:`[devrun]`](#字段表devrun)
  - [字段表:`[health]`](#字段表health)
  - [字段表:`[proxy]`](#字段表proxy)
  - [字段表:`[[logs.sources]]`](#字段表logssources)
  - [字段表:`[env]`](#字段表env)
- [三、枚举值速查](#三枚举值速查)
- [四、校验规则完整清单](#四校验规则完整清单)

---

## 一、`workspace.manifest.toml`

workspace 级声明,全仓库**只有一个**,放根目录。

### 完整示例(带注释)

```toml
# ─── 顶层 ──────────────────────────────────────────────────────
schema_version = 1                  # 【必填】配置版本号,当前是 1。供平台升级时判断兼容/迁移;向前兼容——你现有配置不会因平台升级而失效,照写 1 即可

# ─── workspace 元信息 ──────────────────────────────────────────
[workspace]
name = "my-app"                     # 【必填】workspace 名,非空。会写进 release.lock
description = "一句话描述"           # 【可选】默认无

# ─── 反向代理模式 ──────────────────────────────────────────────
[pingap]
mode = "managed"                    # 【可选,默认 managed】managed / extend / custom
# config = "pingap/"                # 【仅 extend/custom】指向 pingap 配置文件或目录(相对路径)
                                   #   ⚠️ managed 模式下写 config 会报错

# ─── workspace 级健康策略(整段可选)─────────────────────────────
# /health 表示管理进程存活；/ready 根据编排阶段和可选 bridge 判断。
#   业务启动失败不等于 owner 退出；业务可访问性使用独立只读查询。
# 想让"某个后端就绪 = 整个 workspace 就绪":填 bridge_service。
#   平台把 /ready 代理到该后端的 [health].readiness_path 深检查;
#   是否影响容器 Ready/流量由部署探针配置决定，manifest 本身不执行摘流或重启。
[health]
bridge_service = "api"              # 【可选】填某个 service 的 service_id;不写 = 不桥接
```

### 字段表

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|:---:|---|---|
| `schema_version` | 整数 | ✅ | — | 配置版本号,当前 `= 1`。供平台升级时判断兼容/迁移,向前兼容;照写 `= 1` 即可。 |
| `workspace.name` | 字符串 | ✅ | — | workspace 名,非空。 |
| `workspace.description` | 字符串 | ❌ | — | 一句话描述。 |
| `pingap.mode` | 枚举 | ❌ | `managed` | `managed` / `extend` / `custom`。详见 [反向代理与路由](04-pingap-routing.md)。 |
| `pingap.config` | 字符串(相对路径) | ❌ | — | extend/custom 下指向 pingap 配置;**managed 下禁止**。 |
| `health.bridge_service` | 字符串(service_id) | ❌ | 不桥接 | 把整个 workspace 的 `/ready` 桥接到该后端深检查。 |

> workspace manifest **不保存**:镜像、CPU/内存、端口暴露方式、版本保留数。这些是平台策略。

---

## 二、`project.manifest.toml`

参与编排的每个一级服务目录放一个,描述**一个 service**。源码、文档或共享依赖目录无需 manifest。
平台不直接发现根目录或更深层的 `project.manifest.toml`；已有项目可保留原布局,用一级适配目录
调用根构建并归集产物,见 [已有项目接入指引](07-import-existing-project.md)。

### 完整示例(带注释)

```toml
# ─── 顶层 ──────────────────────────────────────────────────────
schema_version = 1                  # 【必填】配置版本号,当前 = 1(用途见上)

# ─── 服务身份 ──────────────────────────────────────────────────
[project]
service_id = "api"                  # 【必填】稳定身份,DNS-1123,workspace 内唯一
name = "My API"                     # 【必填】人类可读名,非空
type = "go"                         # 【必填】node/java/python/go/rust/static
kind = "web"                        # 【可选,默认 web】worker 不公开 [proxy]；HTTP worker 保留内部健康服务
enabled = true                      # 【可选,默认 true】false 则不参与构建/启动

# ─── 构建 ──────────────────────────────────────────────────────
[build]
command = ["sh", "scripts/build.sh"]  # 【必填】argv 数组,直接执行不走 shell;需 shell 用 ["sh","-c","..."]
artifact = "artifact.zip"           # 【必填】构建产物在项目目录内的相对路径(不能绝对/含 ..)

# ─── 运行 ──────────────────────────────────────────────────────
[run]
command = ["./server"]              # 【必填】启动 argv;本例 HTTP 服务监听 0.0.0.0:$PORT
migrate = ["./migrate"]             # 【可选,默认 []】迁移 argv;启动前按拓扑序执行,必须幂等
depends_on = ["worker"]             # 【可选,默认 []】依赖的其他 service_id;控制启动/迁移顺序
shutdown_timeout_seconds = 30       # 【可选,默认 30】优雅关闭超时秒数,必须 > 0

# ─── 健康检查(整段可选,三路径默认 /health)──────────────────────
[health]
startup_path = "/health"            # 【可选,默认 /health】启动探针
readiness_path = "/ready"           # 【可选,默认 /health】就绪路径；声明本身不触发摘流或重启
liveness_path = "/health"           # 【可选,默认 /health】存活探针(见下:不等同于"失败即重启容器")

# ─── 反向代理路由(managed 模式由平台读取;worker 禁止)──────────
[proxy]
path = "/api/"                      # 【必填(若有本段)】绝对 URL 路径,workspace 内唯一
strip_prefix = true                 # 【可选,默认 false】true=转发前剥掉 path 前缀
plugins = []                        # 【可选,默认 []】extend 模式引用的 pingap 插件名
upstream_includes = []              # 【可选,默认 []】extend 模式引用的 upstream 片段名

# ─── 文件日志源(可重复,整段可选)──────────────────────────────
[[logs.sources]]
id = "application"                  # 【必填】DNS-1123,本 service 内唯一;查询时用它定位
glob = "app*.jsonl"                 # 【必填】文件名 glob,相对 $APP_LOG_DIR,不含 / 或 \
format = "jsonl"                    # 【必填】jsonl / text
multiline_start_pattern = "^\\d+"   # 【可选,仅 text】多行日志起始正则;jsonl 下写它会报错

[[logs.sources]]                    # 一个 service 可声明多个 source
id = "access"
glob = "access*.log"
format = "text"

# ─── 服务环境变量(整段可选)────────────────────────────────────
[env]
LOG_LEVEL = "debug"                 # 不能用保留键(PORT/HOST/HOSTNAME/APP_*/RCODER_*)
# DATABASE_URL = "postgres://..."     # 敏感配置直接写这里(明文随源码/发布包保存)
```

### 字段表:`[project]`

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|:---:|---|---|
| `service_id` | 字符串 | ✅ | — | 服务稳定身份。**DNS-1123 label**:小写字母/数字/`-`,1–63 字符,首尾须字母或数字(不能大写、下划线、点)。决定日志目录、路由 upstream、依赖引用。 |
| `name` | 字符串 | ✅ | — | 人类可读名,非空。 |
| `type` | 枚举 | ✅ | — | `node` / `java` / `python` / `go` / `rust` / `static`。**`static` = prod 无业务进程的静态服务**:[run] 段禁止(校验拒绝),`[build].artifact` = 静态内容目录(如 `dist`,构建产目录无需打 zip);平台内置静态托管该目录(lock 分配端口,`/health` 固定 200,未匹配路径 SPA fallback `index.html`)。托管启动成功后才记录启动结果，还需验证真实资源访问。dev 源码态配了 `[devrun]` 时端口让给 dev server(vite dev 热加载),托管跳过。 |
| `kind` | 枚举 | ❌ | `web` | `web`(可声明 `[proxy]`)/ `worker`(后台服务,**不能**声明 `[proxy]`,按 health.startup_probe 决定启动检查，省略保持旧行为)。kind 不免除启动检查。 |
| `enabled` | 布尔 | ❌ | `true` | `false` 不参与构建/启动。至少保留一个 enabled 服务；managed 模式还须有 enabled web。 |

### 字段表:`[build]`

| 字段 | 类型 | 必填 | 说明 |
|---|---|:---:|---|
| `command` | 字符串数组(argv) | ✅ | 构建命令,**直接执行不经过 shell**。需要 shell 功能显式 `["sh","-c","..."]`。不能为空数组,每个参数非空、不含 NUL。工作目录 = 子项目目录。 |
| `artifact` | 字符串(相对路径) | ✅ | 构建产物路径(在项目目录内)。不能绝对、不能含 `..`。会被打入发布包。 |

### 字段表:`[devbuild]`

整段可选。**dev 阶段编译/准备命令**(职责域:依赖安装、type-check 等,均**不要求产出 artifact**)。仅在配了 `[devrun]` 的源码态 dev 链路生效(`/api/v1/userapp/dev/start`·`/restart` 用它编译)。未配本段的缺省三分派:**只配了 `[devrun]` 的服务跳过编译**——devrun 即声明 dev 态自足,跑源码不消费构建产物(依赖安装等前置准备即应放本段,否则首次 dev 启动会因依赖缺失失败);**未配 `[devrun]` 的服务回落 `[build].command`**(刷新源码目录产物如 `app.jar`,run.command 依赖它)。典型用法:前端配 `["pnpm","install","--no-frozen-lockfile"]`(dev 安装允许生成/更新 lockfile,无 lockfile 时 frozen 直接 `ERR_PNPM_NO_LOCKFILE`)或 install+type-check 增量秒级替代全量构建;后端不配(回落 `[build]`)。产物态链路(未配 `[devrun]` 的 app)编译恒用 `[build].command`(发布同核,zip 是 `.run` 部署物必需品,轻量命令不产 zip 不能替换)。

| 字段 | 类型 | 必填 | 说明 |
|---|---|:---:|---|
| `command` | 字符串数组(argv) | ✅(若有本段) | dev 编译/准备命令,规则同 `[build].command`。**不要求产出 artifact**(纯检查/安装命令可用)。 |

### 字段表:`[run]`

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|:---:|---|---|
| `command` | 字符串数组(argv) | ✅ | — | 启动命令。HTTP/TCP 进程监听 `0.0.0.0:$PORT`；显式 process worker 无需监听。 |
| `migrate` | 字符串数组(argv) | ❌ | `[]` | 数据迁移命令。**启动前**按拓扑顺序执行。必须幂等。 |
| `depends_on` | 字符串数组(service_id) | ❌ | `[]` | 依赖的其他服务。驱动 migrate/启动顺序:被依赖者先。不能自依赖、不能引用不存在/disabled 的服务、不能成环。 |
| `shutdown_timeout_seconds` | 整数 | ❌ | `30` | 优雅退出声明值，必须 `> 0`；app-cli >= 0.3.16 的交互 Stop/Restart/取消退出宽限上限为 3 秒，不能靠调大本值延长。 |

### 字段表:`[devrun]`

整段可选。**dev 阶段热加载启动命令,缺省回落 `[run].command`**(vite/nodemon/spring-boot:run/air 等改码即生效的命令)。**任一 enabled 服务配置本段,即把该 app 的 dev 链路切为源码态**:dev/start·restart 编译(`[devbuild]` 显式配置则执行,未配则**本服务跳过编译**——本段即声明 dev 态自足)后 app-cli >= 0.3.16 经唯一持久 `serve` owner 编排当前源码 workspace 并用本段启动——不再部署 `.run` 产物。端口注入(`0.0.0.0:$PORT`)、健康检查与产物态一致;pingap 可通过 `proxy.dev_strip_prefix` 为 devrun 覆盖前缀策略;生产部署不读本段。源码态约定:未配本段的服务用 `[run].command` 在**源码目录**启动,依赖 build 产物落在源码目录(模板形态:`app.jar`/`dist` 在项目根)。Source Start/Restart 重新读取当前 manifest、构建输入和运行配置；缺失、损坏或派生输入改变的 `release.lock.toml` 按规则重建，有效且内容一致的锁保留，不用旧 ZIP、`.run` 或历史 release ID 阻断新的源码请求。

| 字段 | 类型 | 必填 | 说明 |
|---|---|:---:|---|
| `command` | 字符串数组(argv) | ✅(若有本段) | dev 启动命令。HTTP/TCP 服务**须监听 `0.0.0.0:$PORT`**(注入同 `[run]`;vite 经 `vite.config.ts` 的 `server.port = Number(process.env.PORT)` 对接)。**并应答 `[health].readiness_path`**(vite 模板经 `configureServer` 插件实现 `/health`)——否则 dev server 会被 pingap 健康探针摘流(经 9080 的预览 503);Vite 的 dev/build `base` 都应与 `[proxy].path` 对齐(如 `/react/`)，devrun 配 `dev_strip_prefix = false`，让浏览器资源 URL 留在子路径内；prod 静态托管仍用 `strip_prefix = true`。 |

### 字段表:`[health]`

整段可选。HTTP 检查的三个路径默认都是 `/health`，请求期望 2xx。显式 process 不发网络请求。路径必须以 `/` 开头,不含 `..`/`?`/`#`。

健康有三层,职责不同、不要混用:

| 层 | 端点 | 回答的问题 |
|---|---|---|
| 服务自己的健康路径(本段声明) | 你的进程内路由(如 `/health`、`/api/health`) | 这个服务进程与它声明的依赖是否正常 |
| app-cli 容器探针 | 容器管理端口 `:3010` 的 `/health`、`/ready`(app-cli 自身,不是业务域名路径) | 编排器/容器是否就绪 |
| RCoder 业务就绪查询 | `GET /api/v1/userapp/{app_id}/{app_stage}/readiness`(平台 API) | 当前实例声明的服务集合 + 代理入口是否整体可访问 |

健康端点应**廉价、只读、直接返回**结果(如 DB 轻量 ping);不要在健康路径里做昂贵操作或修改状态。

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `startup_path` | 字符串 | `/health` | 启动健康路径声明,不单独取代当前启动检查使用的 `readiness_path`。 |
| `readiness_path` | 字符串 | `/health` | 服务就绪路径。当前 builtin 对非 devrun 进程做该路径的 HTTP 2xx 检查；dev + devrun 使用 TCP。业务就绪查询消费参与聚合的 web 服务,不会查询 worker 的 HTTP 健康。 |
| `liveness_path` | 字符串 | `/health` | 存活探针声明。**注意**:它不等同于"连续失败就重启整个容器"——是否装配为容器级 liveness 探针由平台运行时配置决定(当前 prod 容器探针走管理端口 `/health`/`/ready`,不逐项目消费该字段);不要按"会自动重启"设计依赖。 |
| `startup_timeout_seconds` | 整数 | `25` | builtin 单服务启动检查预算(秒),按实际路径做 TCP/HTTP 检查；失败进入服务/操作失败清单,不能按“其他服务已起”报告全体成功。必须 `> 0`。 |

这些字段不是三套已经运行的容器探针。supervisord 沿用其进程启动确认和可选 workspace bridge,不与 builtin 的逐服务探测完全等价。worker 不自动免探测。app-cli >= 0.3.9 支持可选 `startup_probe="http"/"tcp"/"process"`；省略保持上述旧行为。process 仅限非 static 的 worker，不声明代理、bridge 或 HTTP 路径；详见 [worker 模式](08-worker.md)。

> 纯静态前端可用 `"/"`。是否把"后端 ready"上升为"整个 app ready",由 workspace 的 `[health].bridge_service` 控制。

### 字段表:`[proxy]`

React/Vue 新模板以 `[proxy].path` 为 Vite dev/build base 的唯一来源，由配置文件在每次启动/构建时读取。
更改公共路径只改本字段，不手改 Vite base；改后重启 dev、重新构建 prod。保留模板生成的 dev/prod
前缀策略，多个同类前端使用唯一 service_id/path，详见 [路由文档](04-pingap-routing.md#4-路由规划)。

可选。**仅 `pingap.mode = managed` 时由平台读取生成路由**。`kind = worker` 的服务**禁止**声明。`type = static` 服务编译期自动校验 base/`path`/`strip_prefix`/产物布局联动(烧进 `dist/index.html` 的资源引用按本段规则推演 pingap 翻译链路),错配构建失败并给修复指引(如构建工具 base/publicPath 应与 `path` 一致)。

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|:---:|---|---|
| `path` | 字符串(绝对 URL 路径) | ✅(若有本段) | — | 路由前缀,以 `/` 开头。**workspace 内唯一**;**全 workspace 最多一个 `/`**(catch-all)。不含 `..`/`?`/`#`。 |
| `strip_prefix` | 布尔 | ❌ | `false` | `true` = 转发前剥掉 `path` 前缀;`false` = 原样转发。 |
| `dev_strip_prefix` | 布尔 | ❌ | 沿用 `strip_prefix` | app-cli ≥ 0.3.7；仅 dev 模式且该服务使用 `[devrun]` 时覆盖。managed/extend 生效；custom 自行配置。 |
| `plugins` | 字符串数组 | ❌ | `[]` | extend 模式引用的 pingap 插件名。managed 留空。 |
| `upstream_includes` | 字符串数组 | ❌ | `[]` | extend 模式引用的 upstream 片段名。managed 留空。 |

### 字段表:`[[logs.sources]]`

可选,可重复(每个 service 可声明多个 source)。整段 `[logs]` 默认为空。

| 字段 | 类型 | 必填 | 说明 |
|---|---|:---:|---|
| `id` | 字符串 | ✅ | source 标识,DNS-1123,**本 service 内唯一**。日志查询用 `serviceId + sourceIds` 定位。 |
| `glob` | 字符串 | ✅ | 文件名 glob,**相对实际 `$APP_LOG_DIR`**。**不能含 `/` 或 `\`**——只匹配文件名,不跨目录。如 `app*.jsonl`、`runtime.*.log`。 |
| `format` | 枚举 | ✅ | `jsonl`(每行一个 JSON 对象,推荐)/ `text`(普通文本)。 |
| `multiline_start_pattern` | 字符串(正则) | ❌ | 标记一条多行日志的起始行(如 Java 堆栈)。**仅 `text` 可用**;`jsonl` 下写它会报错。 |

### 字段表:`[env]`

可选。平铺的 `key = "value"` 表,运行时注入给本服务。

PG 启动等待由运行环境决定，不写入模板清单。RCoder 的 UserApp 容器默认注入 `APP_CLI_REQUIRE_PG=1`；独立运行 app-cli 时默认不做 PG 前置探测，数据库由客户端或用户准备。显式启用探测时，连接目标由 `DATABASE_URL` 或 PG 连接环境变量决定，支持其他 IP 和端口，并非固定本机 5432。

| 约束 | 说明 |
|---|---|
| key 不能是保留键 | `PORT`、`HOST`、`HOSTNAME`、`APP_LOG_DIR`、`APP_SERVICE_ID`、`APP_RELEASE_ID` 禁用。 |
| key 不能以 `RCODER_` 开头 | 平台保留前缀。 |
| 明文保存 | 环境变量的值(含敏感配置)以明文随源码和发布包保存;只有能访问应用源码/版本的人可见,按此范围评估敏感度。 |

---

## 三、枚举值速查

| 字段 | 取值 |
|---|---|
| `[project].type` | `node` / `java` / `python` / `go` / `rust` / `static` |
| `[project].kind` | `web`(默认)/ `worker` |
| `[pingap].mode` | `managed`(默认)/ `extend` / `custom` |
| `[[logs.sources]].format` | `jsonl` / `text` |

> 枚举写错(如 `type = "golang"` 或 `kind = "background"`)会**直接失败**。上面是全部合法取值。

---

## 四、校验规则完整清单

以下任一条件触发,**构建立即失败**并报清楚原因:

**Schema / 版本**
- `schema_version` 当前须为 `1`(配置版本号;平台用它做升级兼容/迁移判断,向前兼容——现有配置无需改动);
- 每个配置段严格模式,**未知字段**直接失败。

**身份 / 唯一性**
- `service_id` 必须是 DNS-1123 label(小写/数字/`-`,1–63,首尾字母数字);
- `service_id` 在 enabled 服务间**唯一**;
- `logs.sources.id` 是 DNS-1123 且**本 service 内唯一**;
- 至少一个 `enabled = true` 的服务；managed 模式至少有一个 enabled web，不能只有 worker。

**命令(argv)**
- `build.command` / `run.command` 非空 argv,每个参数非空、不含 NUL;
- `run.migrate` 若非空,同样校验。

**路径安全**
- `build.artifact`、`pingap.config`、`logs.sources.glob`:**禁止绝对路径、`..`、符号链接逃逸**;
- `logs.sources.glob` 额外**禁止含 `/` 或 `\`**(只匹配文件名);
- `proxy.path` 和三个 health path:必须以 `/` 开头,不含 `..`/`?`/`#`。

**路由**
- `proxy.path` 在 enabled 服务间**唯一**;
- **全 workspace 最多一个 `/`**(catch-all)。

**服务类型约束**
- `kind = "worker"` 的服务**不能**声明 `[proxy]`。
- `type = "static"` 的服务**不能**配置 `[run].command` / `[run].migrate`(prod 无业务进程,`[run]` 整段省略,内置静态托管承载；dev 可用 `[devrun]`);构建期还会校验静态产物与 `[proxy]` 的路由一致性(资源引用逃逸/翻译后文件不存在 → 构建失败,见 [字段表:`[proxy]`](#字段表proxy))。

**依赖**
- `depends_on` 引用必须是**已存在且 enabled**的 `service_id`(不是目录名);
- 不能自依赖;不能成环(有拓扑序)。

**其他**
- `run.shutdown_timeout_seconds` 必须 `> 0`;
- `multiline_start_pattern` 仅 `text` 格式可用,`jsonl` 下禁止;
- `[env]` 的 key 不能是保留键或 `RCODER_*`;
- `pingap.mode = managed` 时**不能**写 `pingap.config`。

---

下一篇:[反向代理与路由](04-pingap-routing.md)

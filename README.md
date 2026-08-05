# UserApp Workspace 模板

本仓库是 RCoder **UserApp** 应用的 workspace 模板。一个 `app_id` 对应**一个 workspace**;一个
workspace 可以包含**多个不同语言的服务**(前端 + 后端、多个后端、带数据库的 Next.js 单体……)。
整个 workspace 作为一个整体被**构建、发布、回滚**——这是 UserApp 的核心模型。

仓库里现成放了一个**最复杂的组合**:7 个子项目(React / Vue / Next.js + Go / Java / Python / Rust),
用来演示多前端、多后端、不同日志格式和路由前缀如何共存。你可以直接删掉用不到的目录,只要保留
**至少一个 `enabled = true` 的服务**即可。

---

## 1. 核心设计(先建立心智模型)

理解以下 6 条原则,就能避免 90% 的配置错误:

| # | 原则 | 对你写配置的影响 |
|---|---|---|
| 1 | **workspace 是发布原子** | 不能单独发布/回滚某一个服务。前后端、路由、数据库迁移必须整套一起上,所以一个 workspace 内的服务要彼此配套。 |
| 2 | **两级 Manifest** | 仓库根一个 `workspace.manifest.toml`;每个一级子目录一个 `project.manifest.toml`。平台只认这两个文件。 |
| 3 | **严格校验,Fast Fail** | 写错一个字段(拼写、未知字段、非法枚举、重复路由、依赖环……)**构建直接失败并报清楚原因**,不会带着错误配置默默上线。每个 section 都是 `deny_unknown_fields`,多写一个字会报错。 |
| 4 | **端口由平台定,不由你定** | 服务**必须监听 `0.0.0.0:$PORT`**,`PORT` 是平台在构建时确定并写进 `release.lock.toml` 的(确定性端口,范围 4000–7999)。代码里**硬编码端口 = 必错**。 |
| 5 | **镜像/资源/端口由平台管** | 运行时镜像、CPU/内存、存储大小、版本保留数都是**平台策略**,不在 TOML 里。需要的环境变量(含数据库连接串、API Key 等)写在 `[env]` 里,以明文随源码和发布包保存——按应用的访问范围评估其敏感度即可。 |
| 6 | **`service_id` 是稳定身份** | 服务的真实身份是 `service_id`,**不是目录名**。改目录名不影响服务身份;但 `service_id` 一旦上线就不要随便改(它决定了日志目录、路由 upstream、依赖关系)。 |

---

## 2. 目录结构

```text
my-workspace/
├── workspace.manifest.toml          # 必有:workspace 级声明(名称、pingap 模式、健康策略)
│
├── backend-go/
│   └── project.manifest.toml        # 必有:参与构建
├── frontend-react/
│   └── project.manifest.toml        # 必有:参与构建
│
├── imported-old-project/
│   └── project.manifest.draft.toml  # ⚠️ 草稿:【不参与构建】,仅用于"已有项目导入确认"
│
└── pingap/                          # 仅 pingap = extend/custom 时需要
```

**发现规则**(代码里写死,记牢):

- 平台**只扫描一级子目录**,不会进二级目录找 manifest;
- **只有文件名正好是 `project.manifest.toml` 的目录才参与构建**;`*.draft.toml`、`manifest.toml`、
  `project.toml` 等任何其他名字都**被忽略**;
- 多个服务按 `service_id` 字母序发现,再按 `depends_on` 做拓扑排序,决定 migrate / 启动顺序。

---

## 3. `workspace.manifest.toml` 详解

这是 workspace 的"总声明",全仓库只有一个,放在根目录。

### 完整示例

```toml
schema_version = 1                  # 必填,当前是 1;配置版本号,平台用它判断升级兼容,向前兼容(现有配置不会因升级失效)

[workspace]
name = "my-app"                     # 必填,非空,workspace 的名字
description = "可选的一句话描述"      # 可选

[pingap]
mode = "managed"                    # 可选,默认 managed。三选一:managed / extend / custom
# config = "pingap/"                # 仅 extend/custom 用;managed 下写它会报错

# ── workspace 级健康策略(整段可选,默认不配)─────────────────────────────
# 不写 [health]:平台自动提供 /health + /ready,不依赖任何后端。
#   后端有 bug 起不来时,容器依然 Ready、可进容器排查;纯静态前端也无需关心。
# 想让"某个后端的就绪 = 整个 workspace 的就绪":取消注释,填它的 service_id。
#   平台会把 /ready 代理到该后端的 [health].readiness_path 深检查;
#   后端不 ready 会摘流(NotReady),但 /health 仍 200(不会杀容器重启)。
# [health]
# bridge_service = "backend-go"      # 填某个 project 的 service_id
```

### 字段说明

| 字段 | 必填 | 默认 | 说明 |
|---|:---:|---|---|
| `schema_version` | ✅ | — | 配置版本号,当前 `= 1`。供平台升级时做兼容/迁移判断,向前兼容——你无需关心,照写 `= 1` 即可。 |
| `workspace.name` | ✅ | — | workspace 名称,非空。会写进 `release.lock.toml`。 |
| `workspace.description` | ❌ | — | 一句话描述。 |
| `pingap.mode` | ❌ | `managed` | 反向代理模式,见 [§7 Pingap 模式](#7-pingap-三种模式)。 |
| `pingap.config` | ❌ | — | extend/custom 下指向 pingap 配置文件/目录(**相对路径**);managed 下**禁止填写**。 |
| `health.bridge_service` | ❌ | 不桥接 | 填一个 `service_id`,把 workspace 的 `/ready` 桥接到该后端深检查。不写 = 平台自给自足。 |

> 💡 workspace manifest **不保存**镜像、CPU/内存、端口暴露方式、版本保留数——这些都是平台策略。

---

## 4. `project.manifest.toml` 详解

每个一级子目录放一个,描述**一个服务**(一个可独立构建、启动、产日志的子项目)。下面逐 section 讲。

### 4.0 完整骨架(以 Go 后端为例)

```toml
schema_version = 1

[project]
service_id = "backend-go"           # 必填,稳定身份,DNS-1123,workspace 内唯一
name        = "Go Backend"          # 必填,人类可读名
type        = "go"                  # 必填:node / java / python / go / rust / static
kind        = "web"                 # 可选,默认 web。web / worker
enabled     = true                  # 可选,默认 true

[build]
command  = ["sh", "scripts/build-standalone.sh"]   # 必填,argv 数组,非空
artifact = "artifact.zip"           # 必填,构建产物在项目目录内的相对路径

[run]
command                 = ["./server"]   # 必填,argv 数组
migrate                 = []             # 可选,数据迁移命令 argv;启动前按拓扑序执行
depends_on              = []             # 可选,依赖的其他 service_id 列表
shutdown_timeout_seconds = 30            # 可选,默认 30;优雅关闭超时,必须 > 0

[health]                            # 可选,三路径默认都是 /health
startup_path   = "/health"
readiness_path = "/ready"
liveness_path  = "/health"

[proxy]                             # 可选;kind = worker 时【禁止】声明
path             = "/api/go/"       # 必填(若有本段),绝对 URL 路径,workspace 内唯一
strip_prefix     = true             # 可选,默认 false;是否把 path 前缀从请求剥掉再转给后端
plugins          = []               # 可选,extend 模式引用的 pingap 插件名
upstream_includes = []              # 可选,extend 模式引用的 upstream 片段名

[[logs.sources]]                    # 可选,可重复;声明文件日志源
id      = "application"             # 必填,DNS-1123,本 service 内唯一
glob    = "backend-go*.log*"        # 必填,文件名 glob(相对日志目录,不含 / 或 \)
format  = "jsonl"                   # 必填:jsonl / text
# multiline_start_pattern = "^..."  # 可选,仅 text 可用;jsonl 下写它会报错

[env]                               # 可选,服务运行时环境变量
SOME_KEY = "some-value"             # 不能用保留键(见 §6)
```

> 💡 **大部分字段都有默认值,真正必填的很少。** 一个对外的 web 服务,最小可用配置只有这么多:
> ```toml
> schema_version = 1
> [project]
> service_id = "my-api"
> name = "My API"
> type = "go"
> [build]
> command = ["sh", "build.sh"]
> artifact = "artifact.zip"
> [run]
> command = ["./server"]
> [proxy]
> path = "/api/my/"
> ```
> `kind`(默认 web)、`enabled`(默认 true)、`migrate`/`depends_on`(默认空)、`shutdown_timeout_seconds`
> (默认 30)、`[health]`(默认 /health)、`[proxy]` 的 `strip_prefix`/`plugins`/`upstream_includes`、
> `[logs]`、`[env]` 全都可省。本仓库各子目录的 `project.manifest.toml` 就是按这个原则精简过的。

### 4.1 `[project]` — 服务身份

| 字段 | 必填 | 默认 | 说明 |
|---|:---:|---|---|
| `service_id` | ✅ | — | 服务的**稳定身份**。必须符合 **DNS-1123 label**:小写字母/数字/`-`,1–63 字符,首尾必须是字母或数字(不能大写、不能下划线、不能有点)。workspace 内唯一。**决定了日志目录 `/app/logs/<service_id>`、路由 upstream、依赖引用。** |
| `name` | ✅ | — | 人类可读名称,非空。 |
| `type` | ✅ | — | 运行时语言类型:`node` / `java` / `python` / `go` / `rust` / `static`。 |
| `kind` | ❌ | `web` | `web` = 对外提供 HTTP(可声明 `[proxy]`);`worker` = 后台任务(不监听端口,**不能**声明 `[proxy]`)。 |
| `enabled` | ❌ | `true` | `false` 时该服务不参与构建/启动(但至少要有一个 enabled 服务)。 |

> 💡 **`service_id` 是你自己定义的(就在这里写),所以你本来就知道它。** 它不是内部隐藏字段——部署后
> 它会出现在你直接用到的地方:① 查日志时的 `serviceId` 选择器;② custom pingap 的 `rcoder://<service_id>`;
> ③ 别的服务 `depends_on` 引用它;④ 容器内日志目录 `/app/logs/<service_id>/`。忘了或想确认应用有哪些
> service_id,在平台的**日志面板**或**服务列表**里就能看到应用包含哪些 service。详见
> [docs/05-logs.md](docs/05-logs.md)。

### 4.2 `[build]` — 怎么构建

| 字段 | 必填 | 说明 |
|---|:---:|---|
| `command` | ✅ | 构建命令,**argv 数组**,直接执行**不经过 shell**。需要 shell 功能(pipeline、变量、`&&`)就显式写 `["sh","-c","npm run build && zip -r ..."]`。不能为空数组,每个参数也不能为空或含 NUL。 |
| `artifact` | ✅ | 构建产物的**相对路径**(在项目目录内),如 `artifact.zip`、`userapp-next-standalone.zip`。不能是绝对路径、不能含 `..`。这个产物会被打入发布包。 |

> 构建命令的工作目录就是该子项目目录(`{workspace}/{service 目录}`)。

### 4.3 `[run]` — 怎么运行

| 字段 | 必填 | 默认 | 说明 |
|---|:---:|---|---|
| `command` | ✅ | — | 启动命令,argv 数组,规则同 build.command。**服务必须监听 `0.0.0.0:$PORT`**(`$PORT` 由平台注入)。 |
| `migrate` | ❌ | `[]` | 数据迁移命令 argv。**在服务启动前**按拓扑顺序执行。空数组 = 不迁移。 |
| `depends_on` | ❌ | `[]` | 依赖的其他服务的 **`service_id` 列表**(不是目录名)。驱动 migrate/启动的**拓扑顺序**:被依赖的服务先迁移、先启动。不能自依赖、不能依赖不存在或 disabled 的服务、不能成环。 |
| `shutdown_timeout_seconds` | ❌ | `30` | 收到停止信号后,给服务多久优雅退出(SIGTERM → 等待本值 → SIGKILL)。必须 `> 0`。 |

> ⚠️ `migrate` **必须幂等**(可重复执行不报错),且遵守 expand/contract——因为代码回滚时**平台不会自动执行 down migration**。

### 4.4 `[health]` — 健康检查路径

平台用这三个路径探活(发 HTTP GET,期望 2xx)。整段可选,三个字段默认都是 `/health`。

| 字段 | 默认 | 说明 |
|---|---|---|
| `startup_path` | `/health` | 启动探针路径。 |
| `readiness_path` | `/health` | 就绪探针路径:不 ready 就**摘流**(不转发请求),但不重启容器。 |
| `liveness_path` | `/health` | 存活探针路径:连续失败会**重启容器**。 |

必须是绝对路径(以 `/` 开头),不能含 `..`、`?`、`#`。纯静态前端可以用 `"/"`。

> workspace 层是否把"后端 ready"上升为"整个 app ready",由 `workspace.manifest.toml` 的
> `[health].bridge_service` 控制(见 §3)。不配 = 各服务独立探活。

### 4.5 `[proxy]` — 反向代理路由(managed 模式下)

**仅 `pingap.mode = managed` 时由平台读取并自动生成路由**。声明后,在你的应用子域名下,`path`
开头的请求会被转发到本服务的 `$PORT`。

| 字段 | 必填 | 默认 | 说明 |
|---|:---:|---|---|
| `path` | ✅(若有本段) | — | 路由前缀,绝对 URL 路径,以 `/` 开头。**workspace 内必须唯一**;全 workspace**最多一个 `/`**(catch-all,通常给 Next.js 单体)。不能含 `..`/`?`/`#`。 |
| `strip_prefix` | ❌ | `false` | `true` = 转发前剥掉 `path` 前缀(后端收到的路径不含前缀);`false` = 原样转发。 |
| `plugins` | ❌ | `[]` | extend 模式下引用的 pingap 插件名。managed 下留空。 |
| `upstream_includes` | ❌ | `[]` | extend 模式下引用的 upstream 片段名。managed 下留空。 |

> `kind = "worker"` 的服务**禁止**声明 `[proxy]`(worker 不监听 HTTP)。

**路由规划建议**:每个后端用独立前缀(`/api/go/`、`/api/java/`…),前端用各自路径(`/react`、`/vue`),
最多一个服务用 `/` 作为 catch-all。本模板的路由分配见 [§8](#8-本模板的-service-一览)。

### 4.6 `[[logs.sources]]` — 文件日志声明

声明你的服务把日志写到了哪些文件,平台才能聚合查询。这是个**数组**,每个服务可声明多个 source
(如 `application` + `access`)。整段可选。

| 字段 | 必填 | 说明 |
|---|:---:|---|
| `id` | ✅ | source 标识,DNS-1123,**本 service 内唯一**。日志查询时用 `serviceId + sourceIds` 定位。 |
| `glob` | ✅ | 文件名匹配模式,**相对日志目录**(`$APP_LOG_DIR` = `/app/logs/<service_id>`)。**不能含 `/` 或 `\`**——只匹配文件名,不能跨目录。如 `backend-go*.log*`、`runtime.*.log`。 |
| `format` | ✅ | `jsonl`(每行一个 JSON 对象,推荐)或 `text`(普通文本)。 |
| `multiline_start_pattern` | ❌ | 正则,标记一条多行日志的起始行(如 Java 堆栈)。**仅 `text` 可用**;`jsonl` 下写它会报错。 |

> 应用框架自己负责写文件和轮转(建议 JSONL、按天或 100 MiB 轮转、保留 14 天)。平台只读不写。
> 此外平台会自动把每个服务的 stdout/stderr 捕获到 `runtime.out.log` / `runtime.err.log`。

### 4.7 `[env]` — 服务环境变量

平铺的 `key = "value"` 表,运行时注入给该服务。**不能使用保留键**(见 §6)。环境变量(含数据库连接串、
API Key 等敏感配置)以明文随源码和发布包保存——只有能访问应用的人可见,按这个范围评估敏感度即可。

```toml
[env]
LOG_LEVEL = "debug"
DATABASE_URL = "postgres://user:pass@host/db"   # 敏感配置直接写这里
```

---

## 5. 平台注入的运行时约定

构建/运行时,平台会注入下列**保留环境变量**,你的代码要照约定使用:

| 变量 | 值 | 你的代码应该 |
|---|---|---|
| `PORT` | 平台确定的端口(4000–7999,写进 release lock) | **监听 `0.0.0.0:$PORT`**,别硬编码端口 |
| `HOSTNAME` | `0.0.0.0` | 绑定到它(或 `0.0.0.0`) |
| `APP_LOG_DIR` | `/app/logs/<service_id>` | 把日志文件写到这个目录 |
| `APP_SERVICE_ID` | 本服务的 `service_id` | 需要时读取 |
| `APP_RELEASE_ID` | 当前 release 的 ID | 需要时读取 |

容器内固定目录:

```text
/app/code                          # 当前激活的 release 代码
/app/data                          # PostgreSQL 数据 + 用户持久数据
/app/logs/<service_id>/            # 每个 service 独立日志目录
/app/releases/                     # 历史版本包 + 激活/回滚工作区
```

**数据库**:容器自带 PostgreSQL,你的服务连 `localhost:5432`,账号/库/密码读 `POSTGRES_USER`
(默认 `app`)、`POSTGRES_DB`(默认 `app`)、`POSTGRES_PASSWORD`(平台注入)环境变量。详见
[docs/01-concepts.md](docs/01-concepts.md) 的「数据库」一节。

---

## 6. 校验规则速查(Fail-Fast 清单)

以下任何一条触发,**构建立即失败**并报清楚原因。配置时对照检查:

- **schema**:`schema_version` 当前须为 `1`(配置版本号;平台升级时用它做兼容/迁移判断,向前兼容,现有配置无需改动);未知字段直接失败(每个 section 都是严格模式)。
- **service_id**:DNS-1123 label(小写/数字/`-`,≤63,首尾字母数字),workspace 内唯一。
- **argv**:`build.command` / `run.command` / `run.migrate` 都是非空 argv 数组,每个参数非空、不含 NUL。
- **路径安全**:`build.artifact`、`pingap.config`、`logs.sources.glob` 必须是安全相对路径——**禁止绝对路径、`..`、符号链接逃逸**;glob 还禁止含 `/` 或 `\`。
- **HTTP 路径**:`proxy.path` 和三个 health path 必须以 `/` 开头,不含 `..`/`?`/`#`。
- **路由**:`proxy.path` 在 enabled 服务间唯一;**最多一个 `/`**(catch-all)。
- **worker 约束**:`kind = "worker"` 的服务**不能**声明 `[proxy]`。
- **依赖**:`depends_on` 引用必须是**已存在且 enabled**的 `service_id`;不能自依赖、不能成环。
- **日志**:`logs.sources.id` DNS-1123 且本服务内唯一;`multiline_start_pattern` 仅 `text` 可用。
- **保留环境变量**:`[env]` 的 key 不能是 `PORT`、`HOST`、`HOSTNAME`、`APP_LOG_DIR`、`APP_SERVICE_ID`、`APP_RELEASE_ID`,也不能以 `RCODER_` 开头。
- **至少一个 enabled 服务**:全 disabled 的 workspace 直接失败。
- **pingap**:managed 模式下不能写 `pingap.config`。

---

## 7. Pingap 三种模式

你通过平台分配的**应用子域名**访问应用;子域名背后的流量由应用容器内的反向代理 **Pingap** 按 `[proxy]` 规则分发到各服务(不强制 HTTPS——需要 TLS 由平台终止)。

| 模式 | 谁配路由 | 适用场景 | 你要做什么 |
|---|---|---|---|
| `managed`(默认) | **平台自动**根据各 web 服务的 `[proxy]` 生成 | 绝大多数场景 | 在每个 web 服务的 `[proxy]` 里填 `path`,平台自动生成路由 |
| `extend` | 平台 + 你的补充 | 想加 pingap 插件/存储 | 在 `pingap/` 目录放配置(只允许 `plugins`/`storages`),服务用 `plugins`/`upstream_includes` 引用;名称冲突会失败 |
| `custom` | **你完全自定义** | 需要完全控制路由 | 在 `pingap/` 放原生 Pingap TOML;服务地址写逻辑形式 `addrs = ["rcoder://backend-go"]`,平台转成 `127.0.0.1:<端口>` |

> 护栏:每类对象(server/location/upstream/plugin 等)最多 256 个、总配置最多 2 MiB;Admin 始终关闭;
> Pingap 版本/commit 和运行时镜像绑定(锁在 release lock 里)。这些边界由平台兜底,一般碰不到。

---

## 8. 本模板的 service 一览

本模板 7 个服务故意覆盖了多语言、多前端、不同日志格式和路由前缀。路由分配(都是 managed 模式):

| service_id | 类型 | kind | 路由 path | strip_prefix | 日志格式 | 说明 |
|---|---|---|---|:---:|---|---|
| `backend-go` | go | web | `/api/go/` | true | jsonl | Go 后端 |
| `backend-java` | java | web | `/api/java/` | true | text(多行) | Java 后端,`multiline_start_pattern` 处理堆栈 |
| `backend-python` | python | web | `/api/python/` | true | text(多行) | Python 后端 |
| `backend-rust` | rust | web | `/api/rust/` | true | jsonl | Rust 后端 |
| `frontend-react-vite` | node | web | `/react` | true | text | React SPA |
| `frontend-vue3-vite` | node | web | `/vue` | true | text | Vue3 SPA |
| `userapp-next` | node | web | `/` | false | text | Next.js 单体,**catch-all**(`/` 全站) |

> 注意:`userapp-next` 占了唯一的 `/` catch-all。校验层面它和 SPA 的 `/react`、`/vue`
> **可以共存**(路径互不重复、全 workspace只有一个 `/`)。但 Next.js 单体通常就是"整站",
> 配 `/` 意味着除 `/react`、`/vue`、`/api/*` 之外的流量都落给它。实际部署建议按真实形态二选一:
> 要 Next.js 单体就删掉 SPA;要"前端 SPA + 后端 API"就删掉 Next.js,把 `/` 让给主前端。

---

## 9. 怎么改这个模板

### 场景 A:我只要一个 Go 后端

删掉除 `backend-go/` 外的所有一级子目录(也可保留 `workspace.manifest.toml`)。
`workspace.manifest.toml` 里把 `name` 改成你的应用名即可。`backend-go/project.manifest.toml` 改
`service_id`、`[build]`、`[run]`、`[proxy].path` 适配你的项目。

### 场景 B:加一个后台 worker(不对外)

新建一级子目录 `my-worker/project.manifest.toml`:

```toml
schema_version = 1
[project]
service_id = "my-worker"        # DNS-1123
name = "My Worker"
type = "python"                 # 任意语言
kind = "worker"                 # ← 关键:worker 不监听端口、不能声明 [proxy]
enabled = true
[build]
command = ["sh", "scripts/build.sh"]
artifact = "artifact.zip"
[run]
command = ["python3", "worker.py"]
```

worker 不会被 pingap 暴露路由,但**仍参与拓扑排序/启动/日志**,可以在别的服务的 `depends_on` 里引用。

### 场景 C:前端依赖后端,控制启动顺序

让前端在后端就绪后再启动:

```toml
# frontend-react-vite/project.manifest.toml
[run]
command  = ["node", "static-server.cjs"]
depends_on = ["backend-go"]     # ← 后端的 service_id;平台保证 backend-go 先 migrate + 启动
```

(注意:`depends_on` 只控制**启动顺序**,不是运行时服务发现。前端仍通过 pingap 路由访问后端。)

### 场景 D:换日志格式 / 加 access 日志

```toml
[[logs.sources]]
id = "application"
glob = "app*.jsonl"
format = "jsonl"

[[logs.sources]]
id = "access"
glob = "access*.log"
format = "text"
```

两个 source 的 `id` 都要符合 DNS-1123 且本服务内唯一。

---

## 10. 构建与发布(简述)

配置写好后,完整链路是:**构建 → 准备(prepare) → 激活(activate) → 确认(confirm) → 访问**。

平台会自动:发现并严格校验两个 manifest → 分别构建各服务 → 生成不可变的 `release.lock.toml`
(锁定拓扑顺序、确定性端口、路由、日志源、pingap 版本、运行时镜像) → 组装成
`workspace-package-<release_id>.zip` → 下载校验 → 切换 `/app/code` → 启动 → 健康确认。

- 默认保留最近 **15 个成功版本**,可按应用配置 2–100;当前 active 版本始终保护;
- 激活任意一个保留版本 = **回滚**(短暂停机整组切换);
- 回滚**不执行**数据库 down migration,所以迁移必须幂等 + expand/contract。

想了解平台底层的架构与设计(发布状态机、日志机制、Pingap 三模式实现等),见 RCoder 仓库:

- `docs/application-management-service-v2-design.md` — 平台架构与设计权威
- `docs/userapp-workspace/` — 实现细节文档

> 日常使用不需要看这些——它们是平台实现者的参考。作为应用开发者,读本仓库的 [docs/](docs/) 就够了。

---

## 11. 常见错误对照

| 报错关键词 | 多半原因 | 怎么改 |
|---|---|---|
| `unsupported schema_version` | 漏写或不是 1 | 加 `schema_version = 1` |
| `unknown field` | 拼错字段名 / 多写了字段 | 严格模式,只能写本文列出的字段 |
| `must be a DNS-1123 label` | service_id 含大写/下划线/点/首尾横杠 | 改成小写字母数字加横杠,如 `backend-go` |
| `duplicate service_id` / `duplicate proxy path` | 两个服务用了相同 id 或路由 | 改成唯一 |
| `multiple catch-all routes` | 两个服务都声明 `path = "/"` | 只留一个 `/`(通常给 Next.js 单体) |
| `worker service must not declare [proxy]` | worker 配了代理 | 删掉 worker 的 `[proxy]` 段 |
| `service ... depends on missing or disabled service` | `depends_on` 写了目录名/写错/对方 disabled | 填对方**且 enabled**的 `service_id` |
| `service dependency cycle` | 依赖成环 | 打破循环 |
| `env key is reserved by the runtime` | `[env]` 用了 `PORT`/`RCODER_*` 等 | 换个名字,端口用 `$PORT` |
| `multiline_start_pattern is only valid for text logs` | jsonl 配了多行模式 | 删掉,或把 format 改成 text |
| `must be a safe relative path` | 写了绝对路径或 `..` | 改成相对路径 |

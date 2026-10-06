# UserApp Workspace 模板

本仓库是 RCoder **UserApp** 应用的 workspace 模板。一个 `app_id` 对应**一个 workspace**;一个
workspace 可以包含**多个不同语言的服务**(前端 + 后端、多个后端、带数据库的 Next.js 单体……)。
整个 workspace 作为一个整体被**构建、发布、回滚**——这是 UserApp 的核心模型。

仓库里现成放了一个**最复杂的组合**:8 个子项目(React / Vue / Next.js + Go / Java / Python / Rust + Python worker),
用来演示多前端、多后端、不同日志格式和路由前缀如何共存。仅在使用这份演示模板时,可移除未使用的
模板服务目录,保留根 manifest 和 **至少一个 `enabled = true` 的 web 服务**（managed 模式不支持只有 worker）。
已有项目的业务目录、Git、根 lock 文件和共享依赖应保留。

---

## 0. 快速开始:用 CLI 生成 workspace(推荐)

`init` 用于空目录，或仅有 Git、平台/agent 元数据及用户说明的目录。默认初始化保留已有
`AGENTS.md`、`CLAUDE.md` 和 README，并集合并 `.gitignore`；生成路径冲突时会在写入前拒绝。
已有代码手动导入后,让 agent 按 [已有项目接入指引](docs/07-import-existing-project.md) 增量适配,
保留原技术栈和业务；不要用 `init --force` 覆盖已有项目。

**平台沙箱：**平台提供的 workspace 路径就是唯一应用根。在该根执行
`npx @nuwax-ai/template-cli init . --backend python --frontend react`，manifest 和各服务直接生成在根。
Git、skills、配置、状态等元数据不需要清理，也不需要 `--force`；已有空 `code/` 可以保留，
不能因为根目录非空就改到 `code/` 或应用名子目录内初始化。`code/` 内已有源码或 workspace 时，
按已有项目接入指引适配，不另建嵌套 workspace。

**独立本地开发：**可以用 `init my-app` 创建新目录，或在选定的空目录运行 `init .`。
`--force` 保留用于已明确可丢弃的目标目录；它会覆盖生成文件和所选模板目录。

**运行时要求：** `template-cli` 0.1.14 的 React/Vue 模板使用 `dev_strip_prefix`，需要
app-cli ≥ 0.3.7，以及支持该字段的 RCoder。旧运行时严格解析 manifest 时会拒绝该字段；
平台应先配套升级运行时，再构建或启动新模板生成的应用。

```bash
# 前后端分离:Python 后端 + React 前端
npx @nuwax-ai/template-cli init my-app --backend python --frontend react

# 纯后端 / 纯前端
npx @nuwax-ai/template-cli init my-api --backend java
npx @nuwax-ai/template-cli init my-web --frontend vue

# Next.js 全栈单体(独占 / 路由)
npx @nuwax-ai/template-cli init my-fullstack --next

# 往已有 workspace 追加 service
cd my-app && npx @nuwax-ai/template-cli add backend-rust

# 追加同类模板的第二个实例(如第二个 java 后端)须同时指定新身份与路由,默认身份会冲突被拒
npx @nuwax-ai/template-cli add backend-java --service-id java-admin --path /api/java-admin/
```

安装 Skill(让 AI Agent 自动使用):

```bash
npx skills add https://github.com/nuwax-ai/userapp-workspace-template/tree/main
```

安装命令显式选择 `main`，避免使用仓库默认分支上的其他版本。已安装的 skills 和平台系统提示词
须另行同步，发布 npm 包不会更新正在运行的沙箱。

CLI 源码在 `cli/` 目录,可用模板一览用 `npx @nuwax-ai/template-cli list` 查看。

---

## 1. 核心设计(先建立心智模型)

理解以下 6 条原则,就能避免 90% 的配置错误:

| # | 原则 | 对你写配置的影响 |
|---|---|---|
| 1 | **workspace 是发布原子** | 不能单独发布/回滚某一个服务。前后端、路由、数据库迁移必须整套一起上,所以一个 workspace 内的服务要彼此配套。 |
| 2 | **两级 Manifest** | workspace 根一个 `workspace.manifest.toml`;参与编排的一级服务目录各有一个 `project.manifest.toml`。其他源码、文档和共享依赖目录无需 manifest。 |
| 3 | **严格校验,Fast Fail** | 写错一个字段(拼写、未知字段、非法枚举、重复路由、依赖环……)**构建直接失败并报清楚原因**,不会带着错误配置默默上线。每个 section 都是 `deny_unknown_fields`,多写一个字会报错。 |
| 4 | **端口由平台定,不由你定** | HTTP/TCP 模板的进程服务保留 **`0.0.0.0:$PORT`** 监听与健康接口,包括 HTTP worker；static 的 prod 由平台托管。`PORT` 写进 `release.lock.toml`(确定性端口,范围 4000–7999)。代码里**硬编码端口 = 必错**。 |
| 5 | **镜像/资源/端口由平台管** | 运行时镜像、CPU/内存、存储大小、版本保留数都是**平台策略**,不在 TOML 里。需要的环境变量(含数据库连接串、API Key 等)写在 `[env]` 里,以明文随源码和发布包保存——按应用的访问范围评估其敏感度即可。 |
| 6 | **`service_id` 是稳定身份** | 服务的真实身份是 `service_id`,**不是目录名**。改目录名不影响服务身份;但 `service_id` 一旦上线就不要随便改(它决定了日志目录、路由 upstream、依赖关系)。 |

---

## 2. 目录结构

```text
my-workspace/
├── workspace.manifest.toml          # 必有:workspace 级声明(名称、pingap 模式、健康策略)
├── index.html                       # 可选:访问入口默认页(根路径/未匹配路径兜底展示,可自行修改)
├── database/                        # 可选:workspace 根 SQL(发布时平台自动执行,见下「database 目录」)
│
├── backend-go/
│   └── project.manifest.toml        # 必有:参与构建
├── frontend-react/
│   └── project.manifest.toml        # 必有:参与构建
│
├── imported-old-project/
│   └── project.manifest.draft.toml  # ⚠️ 辅助检测草稿:【不参与构建】,需按实际项目适配
│
└── pingap/                          # 仅 pingap = extend/custom 时需要
```

**发现规则**(代码里写死,记牢):

- 平台**只扫描一级子目录**中的服务 manifest,不发现根目录或更深层的 `project.manifest.toml`;
- **只有文件名正好是 `project.manifest.toml` 的目录才参与构建**;`*.draft.toml`、`manifest.toml`、
  `project.toml` 等任何其他名字都**被忽略**;
- 多个服务按 `service_id` 字母序发现,再按 `depends_on` 做拓扑排序,决定 migrate / 启动顺序。

已有 monorepo 可保留根构建入口、workspace 配置、lock 和 `apps/`、`packages/` 等共享源码,
新增一级适配目录承载服务 manifest,其构建脚本调用原根构建并归集产物。详见
[已有项目接入指引](docs/07-import-existing-project.md)。

**入口默认页 `index.html`**(可选):

- workspace 根放一个 `index.html`,访问入口(容器内 9080 / 生产子域名)的**根路径与未匹配路径**
  就兜底展示这个页面——典型用法是多服务导航页(`template-cli init` 会按所选服务自动生成);
- **服务路由恒优先**:某服务声明 `[proxy].path = "/"`(catch-all,如 userapp-next)时它独占根路由,
  `index.html` 不生效;
- 用户可自行修改内容,**改完刷新即生效**(每次请求实时读文件);`add` 追加服务不会自动更新它,
  想加导航卡片自己编辑即可;
- init 生成的只是**脚手架占位页**——开发完成后应把它更新为应用首页:标题改为应用名,
  卡片用真实功能名与描述替换模板默认文案。想"打开即是应用本身",可让唯一主前端接管 `/`
  (改 `[proxy].path` 并删掉本文件,联动清单见 userapp-dev-guide skill「入口首页策略」)。

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
# /health 表示管理进程存活，/ready 反映编排阶段与可选 bridge。
#   业务启动失败不等于管理进程退出；业务可访问性使用独立只读查询。
# 想让"某个后端的就绪 = 整个 workspace 的就绪":取消注释,填它的 service_id。
#   平台会把 /ready 代理到该后端的 [health].readiness_path 深检查;
#   是否影响容器 Ready/流量由部署探针配置决定，manifest 本身不执行摘流或重启。
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

参与编排的每个一级服务目录放一个,描述**一个服务**(一个可独立构建、启动、产日志的单元)。
不要求 workspace 的所有一级目录都有 manifest。下面逐 section 讲。

### 4.0 完整骨架(以 Go 后端为例)

```toml
schema_version = 1

[project]
service_id = "backend-go"           # 必填,稳定身份,DNS-1123,workspace 内唯一
name        = "Go Backend"          # 必填,人类可读名
type        = "go"                  # 必填:node / java / python / go / rust / static(prod 无业务进程的静态服务)
kind        = "web"                 # 可选,默认 web。web / worker
enabled     = true                  # 可选,默认 true

[build]
command  = ["sh", "scripts/build-standalone.sh"]   # 必填,argv 数组,非空
artifact = "artifact.zip"           # 必填,构建产物在项目目录内的相对路径

[devbuild]                          # 可选,dev 阶段编译/准备命令(依赖安装/type-check 等,不要求产 artifact);
command = ["pnpm", "run", "type-check"]  # 仅配了 [devrun] 的源码态 dev 链路生效。缺省三分派:只配 [devrun]
                                    # 的服务跳过编译(devrun 自足不消费产物);未配 [devrun] 回落 [build].command

[run]
command                 = ["./server"]   # 必填,argv 数组
migrate                 = []             # 可选,数据迁移命令 argv;启动前按拓扑序执行
depends_on              = []             # 可选,依赖的其他 service_id 列表
shutdown_timeout_seconds = 30            # 可选,默认 30;优雅关闭超时,必须 > 0

[devrun]                            # 可选,dev 阶段热加载启动命令;缺省回落 [run].command
command = ["pnpm", "exec", "vite"]  # 配置即把该 app 的 dev 链路切为源码态(跑源码,改码即生效)且声明
                                    # dev 态自足(未配 [devbuild] 则跳过编译);须监听 0.0.0.0:$PORT
                                    # (注入同 [run]);生产部署不读本段

[health]                            # 可选,三路径默认都是 /health
startup_path   = "/health"
readiness_path = "/ready"           # dev 启动判定用它(探测通过=service_start_ok)
liveness_path  = "/health"
# startup_timeout_seconds = 25      # 可选,dev 启动探测窗口(秒);慢启动服务按需调大

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
| `service_id` | ✅ | — | 服务的**稳定身份**。必须符合 **DNS-1123 label**:小写字母/数字/`-`,1–63 字符,首尾必须是字母或数字(不能大写、不能下划线、不能有点)。workspace 内唯一。**决定服务日志归属、路由 upstream、依赖引用。** |
| `name` | ✅ | — | 人类可读名称,非空。 |
| `type` | ✅ | — | 运行时语言类型:`node` / `java` / `python` / `go` / `rust` / `static`。**`static` = prod 无业务进程的静态服务**:省略 `[run]`,`[build].artifact` 为静态内容目录(如 `dist`),平台内置托管并 SPA fallback；dev 可以通过 `[devrun]` 启动 Vite。 |
| `kind` | ❌ | `web` | `web` = 对外提供 HTTP(可声明 `[proxy]`);`worker` = 后台服务(**不能**声明 `[proxy]`,HTTP worker 保留内部健康接口，纯进程 worker 需显式 startup_probe)。不能仅修改 kind 就删除监听服务。 |
| `enabled` | ❌ | `true` | `false` 时该服务不参与构建/启动；至少保留一个 enabled 服务，managed 模式还须有 enabled web。 |

> 💡 **`service_id` 是你自己定义的(就在这里写),所以你本来就知道它。** 它不是内部隐藏字段——部署后
> 它会出现在你直接用到的地方:① 查日志时的 `serviceId` 选择器;② custom pingap 的 `rcoder://<service_id>`;
> ③ 别的服务 `depends_on` 引用它;④ 服务日志归属(目录由 `$APP_LOG_DIR` 注入)。忘了或想确认应用有哪些
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
| `command` | ✅ | — | 启动命令,argv 数组,规则同 build.command。HTTP/TCP 进程监听 `0.0.0.0:$PORT`；显式 process worker 不要求监听。进程态必填;`type = "static"` 服务省略整段。 |
| `migrate` | ❌ | `[]` | 数据迁移命令 argv。**在服务启动前**按拓扑顺序执行。空数组 = 不迁移。 |
| `depends_on` | ❌ | `[]` | 依赖的其他服务的 **`service_id` 列表**(不是目录名)。驱动 migrate/启动的**拓扑顺序**:被依赖的服务先迁移、先启动。不能自依赖、不能依赖不存在或 disabled 的服务、不能成环。 |
| `shutdown_timeout_seconds` | ❌ | `30` | 收到停止信号后,给服务多久优雅退出(SIGTERM → 等待本值 → SIGKILL)。必须 `> 0`。 |

> ⚠️ `migrate` **必须幂等**(可重复执行不报错),且遵守 expand/contract——因为代码回滚时**平台不会自动执行 down migration**。

### 4.4 `[health]` — 健康检查路径

这三个字段声明服务自己的健康路径,不等于平台为每个服务装配了三种容器探针。整段可选,三个字段默认都是 `/health`。未声明 startup_probe 时 builtin 启动检查在 dev + devrun 时检查 TCP,其余进程检查 `readiness_path` 的 HTTP 2xx；没有 `kind=worker` 免检查规则。supervisord 的启动确认与可选 workspace bridge 是独立路径,不能依赖某一种引擎偶然通过来删除健康服务。

| 字段 | 默认 | 说明 |
|---|---|---|
| `startup_path` | `/health` | 启动健康路径声明,不单独取代当前启动检查使用的 `readiness_path`。 |
| `readiness_path` | `/health` | 服务就绪路径,供对应启动检查、业务就绪查询和显式 bridge 使用。查询本身不启动服务、不改变路由、不重启容器。 |
| `liveness_path` | `/health` | 存活路径声明,不等于连续失败会重启整个容器；不要按此假设编写恢复逻辑。 |

必须是绝对路径(以 `/` 开头),不能含 `..`、`?`、`#`。纯静态前端可以用 `"/"`。

> workspace 层是否把"后端 ready"上升为"整个 app ready",由 `workspace.manifest.toml` 的
> `[health].bridge_service` 控制(见 §3)。不配时,容器就绪与业务健康保持分离；不能把容器 Ready 当作全部应用服务已可访问。

### 4.5 `[proxy]` — 反向代理路由(managed 模式下)

**仅 `pingap.mode = managed` 时由平台读取并自动生成路由**。声明后,在你的应用子域名下,`path`
开头的请求会被转发到本服务的 `$PORT`。

| 字段 | 必填 | 默认 | 说明 |
|---|:---:|---|---|
| `path` | ✅(若有本段) | — | 路由前缀,绝对 URL 路径,以 `/` 开头。**workspace 内必须唯一**;全 workspace**最多一个 `/`**(catch-all,通常给 Next.js 单体)。不能含 `..`/`?`/`#`。 |
| `strip_prefix` | ❌ | `false` | `true` = 转发前剥掉 `path` 前缀(后端收到的路径不含前缀);`false` = 原样转发。 |
| `dev_strip_prefix` | ❌ | 沿用 `strip_prefix` | app-cli ≥ 0.3.7；仅 dev 模式且本服务运行 `[devrun]` 时覆盖。Vite 子路径模板设 `false`，配合 dev/build 一致的带前缀 base；prod 仍用 `strip_prefix`。 |
| `plugins` | ❌ | `[]` | extend 模式下引用的 pingap 插件名。managed 下留空。 |
| `upstream_includes` | ❌ | `[]` | extend 模式下引用的 upstream 片段名。managed 下留空。 |

> `kind = "worker"` 的服务**禁止**声明 `[proxy]`(不公开路由,仍可有内部 HTTP 健康接口)。

**路由规划建议**:每个后端用独立前缀(`/api/go/`、`/api/java/`…),前端用各自路径(`/react`、`/vue`),
最多一个服务用 `/` 作为 catch-all。本模板的路由分配见 [§8](#8-本模板的-service-一览)。

### 4.6 `[[logs.sources]]` — 文件日志声明

声明你的服务把日志写到了哪些文件,平台才能聚合查询。这是个**数组**,每个服务可声明多个 source
(如 `application` + `access`)。整段可选。

| 字段 | 必填 | 说明 |
|---|:---:|---|
| `id` | ✅ | source 标识,DNS-1123,**本 service 内唯一**。日志查询时用 `serviceId + sourceIds` 定位。 |
| `glob` | ✅ | 文件名匹配模式,**相对实际 `$APP_LOG_DIR`**。**不能含 `/` 或 `\`**——只匹配文件名,不能跨目录。如 `backend-go*.log*`、`runtime.*.log`。 |
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
| `PORT` | 平台确定的端口(4000–7999,写进 release lock) | HTTP/TCP 进程监听 `0.0.0.0:$PORT`，process worker 不要求监听 |
| `HOSTNAME` | `0.0.0.0` | 绑定到它(或 `0.0.0.0`) |
| `APP_LOG_DIR` | 实际注入的服务日志目录 | 把日志文件写到这个目录 |
| `APP_SERVICE_ID` | 本服务的 `service_id` | 需要时读取 |
| `APP_RELEASE_ID` | 当前 release 的 ID | 需要时读取 |

工作目录使用平台实际提供的 workspace，服务命令在对应子目录执行；日志使用 `$APP_LOG_DIR`，
持久数据使用平台挂载目录。RCoder UserApp 容器目前以 `/home/user` 为挂载根，独立 app-cli
使用调用方指定的 workspace/log-dir；不把 `/app/code` 等 CLI 默认值当作固定部署路径。

**数据库**:容器自带 PostgreSQL,你的服务连 `localhost:5432`,账号/库/密码读 `POSTGRES_USER`
(未注入时默认 `dev`)、`POSTGRES_DB`(未注入时默认 `dev`)、`POSTGRES_PASSWORD`(平台注入,
未注入时默认 `dev`)环境变量。详见
[docs/01-concepts.md](docs/01-concepts.md) 的「数据库」一节。

**database 目录**:workspace 根 `database/` 与各子项目 `{目录}/database/` 下的 `.sql`
文件,会在**发布(activate)成功后**被平台按序自动执行(根先、子项目按目录字典序、
文件名字典序;须幂等;单文件失败仅日志不阻断发布)。**开发阶段不会自动执行**——本地
调试时 schema 变更需手动跑(dbx / psql)。完整规则见 [database/README.md](database/README.md)。

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
- **static 约束**:`type = "static"` 的服务**不能**配置 `[run].command` / `[run].migrate`(prod 无业务进程,`[run]` 整段省略,平台内置静态托管承载；dev 使用 `[devrun]`)。
- **依赖**:`depends_on` 引用必须是**已存在且 enabled**的 `service_id`;不能自依赖、不能成环。
- **日志**:`logs.sources.id` DNS-1123 且本服务内唯一;`multiline_start_pattern` 仅 `text` 可用。
- **保留环境变量**:`[env]` 的 key 不能是 `PORT`、`HOST`、`HOSTNAME`、`APP_LOG_DIR`、`APP_SERVICE_ID`、`APP_RELEASE_ID`,也不能以 `RCODER_` 开头。
- **至少一个 enabled 服务**:全 disabled 的 workspace 直接失败；managed 模式至少有一个 enabled web，不能只有 worker。
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

本模板的 web 服务故意覆盖了多语言、多前端、不同日志格式和路由前缀。路由分配(都是 managed 模式):

| service_id | 类型 | kind | 路由 path | strip_prefix | 日志格式 | 说明 |
|---|---|---|---|:---:|---|---|
| `backend-go` | go | web | `/api/go/` | true | jsonl | Go 后端 |
| `backend-java` | java | web | `/api/java/` | true | text(多行) | Java 后端,`multiline_start_pattern` 处理堆栈 |
| `backend-python` | python | web | `/api/python/` | true | text(多行) | Python 后端 |
| `backend-rust` | rust | web | `/api/rust/` | true | jsonl | Rust 后端 |
| `frontend-react-vite` | static | web | `/react` | true | — | React SPA,prod 内置静态托管；dev 为 Vite |
| `frontend-vue3-vite` | static | web | `/vue` | true | — | Vue3 SPA,prod 内置静态托管；dev 为 Vite |
| `userapp-next` | node | web | `/` | false | text | Next.js 单体,**catch-all**(`/` 全站) |

> 注意:`userapp-next` 占了唯一的 `/` catch-all。校验层面它和 SPA 的 `/react`、`/vue`
> **可以共存**(路径互不重复、全 workspace 只有一个 `/`)。具体前缀优先，其余流量交给 `/`。
> 按业务需求选择组合，检查前缀没有占用 Next 的页面/API；不因默认选型删除已有模块。
> `init --next` 与 `--backend/--frontend` 互斥只是初始化选项限制，之后可用 `add` 追加服务。

---

## 9. 怎么改这个模板

### 场景 A:我只要一个 Go 后端

仅在新复制的演示模板中移除其他未使用的模板服务目录,保留根 `workspace.manifest.toml`、文档和工具目录。
已有用户代码与共享依赖目录必须保留；也可在空目录用 `init --backend go` 按需生成。
`workspace.manifest.toml` 里把 `name` 改成你的应用名即可。`backend-go/project.manifest.toml` 改
`service_id`、`[build]`、`[run]`、`[proxy].path` 适配你的项目。

### 场景 B:加一个后台 worker(不对外)

在已有 workspace 中添加:

```bash
npx @nuwax-ai/template-cli add backend-python --kind worker --service-id my-worker
```

CLI 保留 Python 模板的 FastAPI/Uvicorn 入口、`[health]` 和 `0.0.0.0:$PORT` 监听,只将 kind 设为 worker 并省略 `[proxy]`。在应用生命周期中增加后台任务,关闭时收束任务；不要把 `main.py` 改成仅后台循环,也不要以固定成功的健康响应掩盖任务初始化失败。

worker 不公开 pingap 路由,但**仍参与拓扑排序/启动/日志**,可在其他服务的 `depends_on` 里引用。`worker-python` 为显式 process 模式，需实际 app-cli >= 0.3.9 且 owner 支持 `startup-probe-v1`；不把正常退出的批处理脚本当成常驻服务。第二个 worker 使用唯一 `--service-id`，不传 `--path`。见 [worker 模式](docs/08-worker.md)。

### 场景 C:前端依赖后端,控制启动顺序

让有进程的前端(如 Next.js 单体 `userapp-next`)在后端就绪后再启动:

```toml
# userapp-next-template/project.manifest.toml
[run]
command    = ["node", "server.js"]
depends_on = ["backend-go"]     # ← 后端的 service_id;平台保证 backend-go 先 migrate + 启动
```

(注意:`depends_on` 只控制**启动顺序**,不是运行时服务发现。前端仍通过 pingap 路由访问后端。
`type = "static"` 的前端如 `frontend-react-vite` 在 prod 无业务进程、无 `[run]` 段,不适用本例。)

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

配置写好后，完整链路是：**构建 → 制品下载校验/激活 → 服务编排 → 业务就绪查询 → 访问**。

平台会自动:发现并严格校验两个 manifest → 分别构建各服务 → 生成不可变的 `release.lock.toml`
(锁定拓扑顺序、确定性端口、路由、日志源、pingap 版本、运行时镜像) → 组装成
`workspace-package-<release_id>.zip` → 下载校验 → 切换实际部署目录 → 启动 → 核验业务就绪。

- 历史制品保留策略以平台版本管理为准，回滚前核对制品仍可获取；
- 用可用的历史制品重新部署 = **回滚**(整组切换)；`failed` 不代表已经自动恢复旧版本；
- 制品部署段成功不等于业务 Ready；结果未知时继续原操作的恢复核验，不手工清锁；
- 回滚**不执行**数据库 down migration,所以迁移必须幂等 + expand/contract。

想了解平台底层的架构与设计(发布状态机、日志机制、Pingap 三模式实现等),见 RCoder 仓库:

- `docs/application-management-service-v2-design.md` — 平台架构与设计权威
- `docs/userapp-workspace/` — 实现细节文档

> 日常使用不需要看这些——它们是平台实现者的参考。作为应用开发者,读本仓库的 [docs/](docs/) 就够了。

---

## 11. 常见错误对照

React/Vue 新模板的 Vite dev/build base 自动读取子项目 `[proxy].path`。
新增第二个 Vue 等同类模块只需 `template-cli add` 的 `--service-id`、`--path`，不手改 Vite 配置。
改公共路径后重启 dev、重新构建 prod；多前端及存量升级见 [路由文档](docs/04-pingap-routing.md#4-路由规划)。

| 报错关键词 | 多半原因 | 怎么改 |
|---|---|---|
| `unsupported schema_version` | 漏写或不是 1 | 加 `schema_version = 1` |
| `unknown field` | 拼错字段名 / 多写了字段 | 严格模式,只能写本文列出的字段 |
| `must be a DNS-1123 label` | service_id 含大写/下划线/点/首尾横杠 | 改成小写字母数字加横杠,如 `backend-go` |
| `duplicate service_id` / `duplicate proxy path` | 两个服务用了相同 id 或路由 | 改成唯一 |
| `multiple catch-all routes` | 两个服务都声明 `path = "/"` | 只留一个 `/`(通常给 Next.js 单体) |
| `worker service must not declare [proxy]` | worker 配了代理 | 删掉 worker 的 `[proxy]` 段 |
| `static service must not declare [run].command` | `type = "static"` 服务配了启动/迁移命令 | 删掉 `[run]` 段(prod 内置静态托管，dev 可用 `[devrun]`);prod 确实要跑业务进程时改为 `node` 等 |
| `index.html 引用 ... 逃逸出 [proxy].path` / `... 按 strip_prefix=... 翻译后找不到 ...` | static 产物资源引用与 `[proxy]` 错配(构建工具 base 与 path 不一致,或 `strip_prefix` 与产物布局不符) | 构建工具 `base`/publicPath 设为 `[proxy].path`;`strip_prefix` 与产物布局对齐(两种合法布局二选一:`strip=true`+无前缀产物 / `strip=false`+带前缀产物) |
| `service ... depends on missing or disabled service` | `depends_on` 写了目录名/写错/对方 disabled | 填对方**且 enabled**的 `service_id` |
| `service dependency cycle` | 依赖成环 | 打破循环 |
| `env key is reserved by the runtime` | `[env]` 用了 `PORT`/`RCODER_*` 等 | 换个名字,端口用 `$PORT` |
| `multiline_start_pattern is only valid for text logs` | jsonl 配了多行模式 | 删掉,或把 format 改成 text |
| `must be a safe relative path` | 写了绝对路径或 `..` | 改成相对路径 |

## 生产制品与运行资源

本节适用于全部 **8 个模板**，与应用业务语言无关。开发在源码目录运行，prod 只使用 `[build].artifact` 解压后的服务根。新增 `scripts/`、模块、配置、模板、静态/数据资源时，必须让生产制品包含实际入口及依赖，不能只验证 dev 或 ZIP 文件存在。

| 模板 | 生产运行边界与新增资源 |
|---|---|
| Python 后端 | 默认收集未排除的源码、模块、`scripts/`、运行资源及已安装的 `deps/`；依赖安装仍由现有构建脚本负责。 |
| Python worker | 默认收集未排除的源码、模块、`scripts/` 和运行资源；第三方运行依赖仍需显式准备。 |
| Go、Rust | 保留编译出的 `server`，默认加入未排除的 `scripts/` 和新增运行资源；排除已知 `src/`、`cmd/`、`internal/` 源码树及源码文件。 |
| Java | 保留编译出的 `app.jar`，默认加入未排除的 `scripts/` 和新增运行资源；Java 源码与构建缓存不进入制品。 |
| Next.js | 保留 traced standalone 依赖和 `.next/static`，追加未排除的服务根运行资源与 `scripts/`；不会带入源码根完整 `node_modules/`。 |
| React Vite、Vue Vite | prod 只使用 `dist/`；新增静态资源应经构建进入该目录，服务根源码和脚本不自动成为静态产物。 |

共享 `scripts/artifact_pack.py` 使用 **Python 3.11+ 标准库**；Python 只是构建工具的实现语言，不限制业务语言。不安装第三方打包依赖；使用任何模板构建前核对构建环境的 Python 能力。

默认排除实际 `.env*`（保留 example/sample）、私钥/凭据与 agent/VCS 状态、缓存、日志、临时目录和旧制品；源码侧 `node_modules/`、`target/` 等工具链/依赖缓存不进入制品，Python `deps/` 与 Next traced 依赖按上述运行边界保留。服务根 `.artifactignore` 可增加**相对路径 glob 排除**（空行/`#` 注释允许，目录可写 `my-dev-data/`）；不支持 `!` 包含规则，不能覆盖私有文件排除或导致已声明入口缺失。该文件是模板构建脚本的约定，不是新增 manifest 字段。

打包前仅核对 `run.command`、`run.migrate` 中结构明确的相对本地可执行文件、已识别解释器的直接文件入口及 `java -jar` 的 JAR；缺失、被排除、链接逃逸或目录循环立即构建失败。不把任意 argv 数据参数当作路径，不解析 shell `-c`、解释器 `-c`/`-m` 或带选项的复杂命令。ZIP 独立生成后原子替换，失败保留旧有效 ZIP，重新构建不遗留已删除条目。自定义 shell 字符串、动态导入及外部依赖仍需实际运行验证：将**真实新制品**解压到隔离于源码/开发依赖的目录，用其生产入口和安全测试数据库执行必要迁移，再核对业务访问；迁移告警继续启动不代表制品可以漏脚本。

验证报告须分别记录真实 ZIP/目录包装与隔离执行、语言/框架编译、平台启动/访问的结果；包装 fixture 通过不能代替完整框架构建或平台验收。

Next 生产构建尊重显式 `packageManager`（已安装的 npm/pnpm 精确版本）或唯一现有锁文件：npm 使用 `npm ci`，pnpm 使用 `pnpm install --frozen-lockfile`。双锁未声明选择时明确报歧义；声明的管理器缺少对应锁而存在其他锁时，不忽略有效锁或静默切换。两种锁均缺失时，保留模板原有首次安装初始化流程，明确记录本轮无锁输入、生成的锁及摘要，后续构建复用该锁。React/Vue 保留既有 pnpm 安装/首次初始化契约。存量 Next 项目同步 `scripts/install-locked.mjs` 与构建入口；CLI pack 随 Next 模板复制安装器，不自动升级管理器或改锁版本。

共享 helper 的维护源是 `backend-python/scripts/artifact_pack.py`；改动后同步各模板副本，CLI pack 会把这份源文件复制进每个生成模板的 `scripts/`。存量应用需一起更新构建入口与 helper，CLI/模板升级不自动改写旧项目。

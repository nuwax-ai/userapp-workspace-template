---
name: userapp-scaffold
description: >
  使用 template-cli 创建 UserApp workspace 或追加后端、前端、worker，支持多个同类模块。
  包含模板选择、唯一身份与路由、平台固定源码根及已有文件保护。修改 manifest、运行或排查现有应用时
  使用 userapp-dev-guide 的对应章节。手动导入 ZIP/Git/已有业务代码时，转到该技能的导入适配指引，不用 init/add 覆盖原项目。
---

# UserApp 模板脚手架

用 `@nuwax-ai/template-cli` 按需组合多语言模板,创建 UserApp workspace。

## 何时使用

- 用户说"创建一个 UserApp 项目" / "新建 workspace"
- 用户说"加一个 Go/Java/Python/Rust 后端"
- 用户说"加一个 React/Vue 前端"
- 用户说"我要一个全栈项目"(考虑 Next.js)
- 用户要在已有 workspace 里追加模板 service

**已有业务导入不是脚手架新建**：先读取 `userapp-dev-guide` 的“导入已有项目”及该技能目录下的 reference，保留原代码；skill 缺失时用 `template-cli docs` 查 `07-import-existing-project.md`。当前 CLI 没有任意项目的 import/adopt 命令，不自行编造。

## 核心命令

### 查看可用模板

```bash
npx @nuwax-ai/template-cli list            # 当前安装版本的全部模板(含 worker)
npx @nuwax-ai/template-cli list backend    # 只看后端: go / java / python / rust
npx @nuwax-ai/template-cli list frontend   # 只看前端: react / vue
```

### 查看开发者文档

```bash
npx @nuwax-ai/template-cli docs         # 列出随 CLI 分发的开发者文档
npx @nuwax-ai/template-cli docs --open  # 用系统默认程序打开文档目录(macOS)
```

### 新建 workspace

先区分平台开发会话与独立客户端：

- **平台开发会话**：平台工作区契约（文件/chat 接口实际返回的 `workspace_root`）决定唯一源码根；先核对当前 cwd 与该根一致，再记录 `SOURCE_WORKSPACE=$PWD`。初始化、根 manifest 和完成后的校验始终指向此值；进服务目录后不重新赋值，新 shell 恢复已记录的路径。平台预建的空 `code/`、`state/`、`builds/`、`.run/` 不作为源码根，原根非空也不改到下一层。
- **独立客户端**：用户指定 `init <目录名>` 创建新 workspace，进入生成目录后再记录源码根。下方 `<目录名>` 示例属于此流程；平台用 `"$SOURCE_WORKSPACE"` 替代。

平台首次新建的示例：

```bash
# 已核对当前 cwd 与平台返回的 workspace_root 一致后，再记录；不从服务子目录推导
SOURCE_WORKSPACE=$PWD
npx @nuwax-ai/template-cli init "$SOURCE_WORKSPACE" --backend python --frontend react
app-cli validate --help
# 安装版提供 validate 时检查原根；有 dev 运行方式时再加 --dev
app-cli validate --workspace "$SOURCE_WORKSPACE"
```

独立客户端按用户选定目录创建；用户明确允许丢弃并重建该独立目标时，`--force` 保留既有覆盖语义。平台元数据保留及已有应用的增量接入使用普通初始化或适配流程：

```bash
# 后端 + 前端
npx @nuwax-ai/template-cli init <目录名> --backend <lang> --frontend <lang>

# 纯后端
npx @nuwax-ai/template-cli init <目录名> --backend python

# 纯前端
npx @nuwax-ai/template-cli init <目录名> --frontend react

# Next.js 全栈单体(独占 / 路由)
npx @nuwax-ai/template-cli init <目录名> --next
```

普通初始化用于没有业务代码的新 workspace；用户明确要求重建可丢弃的独立目标时适用上面的 force 例外。平台原根仅有 Git/agent 元数据、用户说明或平台预建空目录时正常执行 init，保留已有内容；安装版 CLI 若仍因非空拒绝，在工作区外的空临时目录生成，将缺失的根文件和服务目录最小合入原根，合并既有 AGENTS/CLAUDE/.gitignore，不把整个临时工程放入下一层，也不使用 `--force`。完成后对原根执行 validate，核对实际服务清单。
`code/` 等子目录里已有完整业务工程时，按 dev-guide 导入适配保留代码并接入平台原根；不能将它当空模板覆盖，也不能仅在该子目录校验后宣称平台构建已可用。

初始化后的构建/启动失败先读取平台诊断：`repair_target=project` 才增量修正项目，`platform` 则按 dev-guide 的失败诊断流程处理 owner/平台恢复。原根配置正确时，不重新初始化或搬到 `code/` 迁就错误 owner；保留失败响应的 `data.task_id`（工具封装可能是 `error.data.task_id`）供 GET/SSE 回查。常规非破坏性适配自行完成，保留业务、Git、依赖锁、共享依赖及平台状态；修正后对原根 `validate --dev --json` 并核对预期服务，再实际构建、启动和访问，不能停在脚手架生成或配置通过。

init 在 workspace 根自动生成:`workspace.manifest.toml`、`index.html`(入口首页占位页,catch-all 时跳过;
开发完成后须把它个性化为应用真实首页——标题/卡片用真实应用与功能名,详见 userapp-dev-guide「入口首页策略」;
**`add` 追加服务不会自动更新它**,追加/删除对外服务后需手动增删导航卡片)、
`AGENTS.md`(结构快照 + 契约/工具入口;过时的平台说明按实际工具能力更新,保留用户补充的业务规则)、`CLAUDE.md`(`@AGENTS.md` 导入,供 Claude Code 读)、
`.gitignore`(忽略 app-cli/平台在根产生的派生产物,如 `release.lock.toml`、`.local-deploy/`;**已存在时 init 做并集合并**,不覆盖手工条目;服务目录内的构建产物由各服务自带 `.gitignore` 覆盖)、
`database/`(SQL 约定目录,规则见其 README);各子项目的 `project.manifest.toml` 由 CLI
按所选模板生成(不在模板包里),子项目另有 `database/README.md`。

### 初始化后的构建约定

模板是初始工程，用户可以继续调整技术栈、目录和构建命令，不要求应用长期与模板相同。修改 `[build]` 或 `[run]` 时同时保持生产制品布局：当前进程服务的 `build.artifact` 指向部署 ZIP，平台将其内容展开到服务运行目录；static 仍使用构建输出目录。

Java 默认脚本完成 Maven 编译后，把 JAR 和运行资源包装进 `artifact.zip`，生产命令执行其中的 `app.jar`。替换为自定义 Maven 构建时，保留或补齐部署包装步骤；直接把 Maven 生成的 JAR 路径写入 `build.artifact` 会使 JAR 被当作 ZIP 展开，无法继续按原 JAR 路径启动。可保留用户现有 `java -jar target/...jar` 命令，在部署 ZIP 中保留同一相对路径，具体做法见 dev-guide 的生产制品章节。

初始化成功与编译成功不代表可发布。检查真实新制品的条目，并从隔离解压目录验证生产入口与必要依赖；不要用源码目录或开发命令的成功代替这一步。存量应用只做必要适配，不重新初始化或覆盖用户代码。

### 往已有 workspace 追加 service

```bash
# 平台使用首次记录的 SOURCE_WORKSPACE；独立客户端使用其选定的根
cd "$SOURCE_WORKSPACE"
npx @nuwax-ai/template-cli add <模板id>
# 例: npx @nuwax-ai/template-cli add backend-rust
```

## 模板选择指南

新应用未指定后端语言时，默认 **Python（FastAPI）**；前后端都需要时默认 **Python + React**。命令显式传 `--backend python`，不依赖 CLI 的隐式默认值。用户明确选型优先；已有应用沿用原技术栈，不因默认值迁移或重建。纯前端需求不额外添加后端，明确选择全栈单体时使用 Next.js。

| 用户需求 | 推荐模板 | 命令 |
|---|---|---|
| 纯 API 后端（未指定语言） | `backend-python` | `init <dir> --backend python` |
| 纯前端 SPA | `frontend-react-vite` / `frontend-vue3-vite` | `init <dir> --frontend react` |
| 前后端分离（未指定技术栈） | Python API + React SPA | `init <dir> --backend python --frontend react` |
| 全栈单体(DB + 前端) | `userapp-next` | `init <dir> --next` |
| 多个后端 | 主后端 + 追加 | init 后用 add 追加;**同类多实例须 `--service-id` + `--path`** |
| 加后台 worker | 后端模板 + `--kind worker`，保留内部健康服务 | `add backend-python --kind worker` |

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
- **Next.js**: SSR + API routes + Drizzle ORM + PG。默认使用 `/` catch-all。
  `init --next` 不能同时传 `--backend/--frontend`，这是初始化选项限制。已有 workspace 可用 `add`
  组合具体前缀服务，前缀优先于 `/`；检查新增路由没有占用 Next 的实际页面/API 路径。

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

React/Vue 模板还会生成 `dev_strip_prefix = false`：dev/build base 都带公共前缀，dev 交给 Vite 处理，prod 剥前缀后读取静态产物。需要 app-cli ≥ 0.3.7。

新模板的 `vite.config.ts` 通过 `scripts/manifest-routing.mjs` 在 dev/build 时读取本模块 TOML。
**公共路径只改 `[proxy].path`**，不改 Vite base、不增加路径环境变量或 `--base` 参数。
改路径后重启 dev，prod 重新构建发布；导航卡片按实际路径更新。旧模板需先同步 helper，详见 dev-guide。

**约束**:
- 全 workspace **最多一个 `/`**(catch-all)
- 路由 path 在 workspace 内**唯一**，CLI 将 `/admin` 与 `/admin/` 视为冲突
- CLI 会自动校验冲突,冲突时拒绝并提示

## 自定义 service_id

默认 service_id = 模板 id(如 `backend-go`)。需要自定义时:

```bash
npx @nuwax-ai/template-cli add backend-go --service-id my-api --path /api/v2/
```

自定义 service_id 时,身份相关变量自动派生:
- **子目录名** → `<service_id>`(模板释放到的目录直接以 service_id 命名,不再是模板名)
- Go module 名、Rust crate 名 → `<service_id>`(import 路径同步更新)
- Java artifactId、Spring 应用名 → `<service_id>`
- Python FastAPI title、Rust OpenAPI title → `<service_id>`
- 日志文件名前缀 → `<service_id>`

**注意:Java 的 package 名和源码目录不自动派生**。自定义 service_id 后,Java 的 `package com.example.backendjava;` 声明和 `src/main/java/com/example/backendjava/` 目录结构保持不变(只改 artifactId)。这能正常编译,但如果需要 package 名也跟着变,需手动 rename 目录和修改 package 声明。

## 同类模板的多实例(含两个 Vue 前端)

用户要"再加一个 java/rust/... 后端"时,**直接 `add backend-java` 会被拒绝**——默认身份
(service_id 和 path)已被第一个实例占用。这是 Fail-Fast 设计,不是 bug。

追加 web 实例时使用唯一 `--service-id` 和公共路径；已有实例占用默认路径时同时传 `--path`。
追加 worker 只需要唯一身份，**不传 `--path`**，HTTP worker 和 process worker 都不公开路由：

```bash
# workspace 里已有 backend-java(service_id=backend-java, path=/api/java/)
npx @nuwax-ai/template-cli add backend-java --service-id java-admin --path /api/java-admin/

# 新应用只创建两个 Vue 模块(在空 workspace 执行 init)
npx @nuwax-ai/template-cli init . --frontend vue --service-id admin-web --path /admin/
npx @nuwax-ai/template-cli add frontend-vue3-vite --service-id portal-web --path /portal/

# 第二个后台任务，不声明公共路径
npx @nuwax-ai/template-cli add backend-python --kind worker --service-id audit-worker
```

- 多个前端共享应用域名，分别访问 `/admin/`、`/portal/`；不需要为第二个 Vue 手改 Vite 配置。
- 不复制目录再重命名。由 CLI 生成唯一 service_id、manifest、路径，保留模板的路由读取和健康插件。
- web 服务只给 `--service-id`、仍沿用已占用的默认 path 时会被拒；worker 不参与公共路径冲突校验
- 建议路由从 service_id 派生(`java-admin` → `/api/java-admin/`),语义清晰
- 新实例的身份派生规则(artifactId/应用名/日志文件/目录名自动跟随)见上节"自定义 service_id"
- 两个实例完全独立:各自独立构建(Maven 工程/Go module 按 service_id 命名)、独立日志目录、独立端口(平台注入 `$PORT`);同库建表由 advisory lock 串行化,并发首启安全

## 后台 Worker

需要后台任务(定时任务、队列消费者等)时,用 `--kind worker` 添加 service:

```bash
npx @nuwax-ai/template-cli add backend-python --kind worker --service-id my-worker
```

Worker 与 web 服务的区别:
- **不公开代理路由**,不声明 `[proxy]`；这不禁止内部 HTTP 健康接口
- manifest 里输出 `kind = "worker"`,无 `[proxy]` 段
- 仍参与拓扑排序/启动/日志,可在别的服务的 `depends_on` 里引用
- 当前 CLI 保留所选后端模板的 HTTP 入口与 `[health]`。Python worker 仍运行 FastAPI/Uvicorn,监听 `0.0.0.0:$PORT`；不要把 `main.py` 替换成只有任务循环的程序
- 在应用生命周期中启动后台任务并处理关闭；阻塞任务不能占住 HTTP 事件循环。健康接口应反映初始化与必要依赖状态,不能固定返回成功

当前模板与运行时的共同契约仍要求可探测的常驻服务。无监听 worker 使用 `add worker-python --service-id queue-worker`，它显式生成 `startup_probe="process"`，要求 app-cli >= 0.3.9 且 owner 声明 `startup-probe-v1`；配套运行时未发布/版本不可确认时不要使用。不能仅凭 kind、模块名称或应用自己的设计文档推断支持。正常退出的批处理脚本不是常驻 worker。

## 生成后的典型操作

### 加业务模块(后端)

各后端采用分层架构,新增模块按现有 `item` 模块的模式复制:
- **Go**: `internal/{model,repository,service,handler}/<name>.go`
- **Java**: `model/`, `mapper/`, `service/`, `web/`
- **Python**: `app/{models,repositories,services,routers}/<name>.py`
- **Rust**: `src/{domain,repository,service,handlers}/<name>.rs`

### 前端访问后端

前端用**相对路径**调后端:
```typescript
fetch('/api/python/items')  // 浏览器经反代路由到 backend-python
```

## 重要约束

1. **路由唯一**:全 workspace 最多一个 `/`，可与唯一的具体前缀共存。`init --next` 的参数互斥不等于运行时禁止组合。
2. **按服务类型验证**:HTTP/TCP 进程监听 `0.0.0.0:$PORT`；process worker 验证常驻进程与任务行为；prod 静态服务验证产物和资源访问。
3. **页面默认支持平台 iframe**：用户明确要求禁止或限制嵌入时按其要求实现，说明平台内嵌预览可能不可用，并按用户选定策略验收；用户自行设置的明确嵌入策略不擅自覆盖，意图不明时先澄清。其余情况下，生成后及新增登录/安全中间件时，不得引入阻止平台嵌入的 X-Frame-Options 或 CSP；跨站 iframe 所需的应用会话 Cookie 使用 `SameSite=None; Secure`（会话保留 HttpOnly）。平台 ticket 不替代应用会话配置，curl 成功不代表浏览器验证通过。详细规则见 [userapp-dev-guide 的 iframe 兼容章节](../userapp-dev-guide/SKILL.md#平台-iframe-嵌入与会话兼容)。

> manifest 字段、路由规则、健康检查、日志、部署回滚等平台规范,
> 参考 **userapp-dev-guide** skill。

### 新增生产运行资源

全部 8 个模板适用；Python 是共享打包工具的实现语言，与业务语言无关。文件静态校验仅识别结构明确的相对本地可执行文件、已识别解释器的直接文件入口及 `java -jar`；不猜测任意 argv 数据参数，不解析 shell `-c`、解释器 `-c`/`-m` 或带选项的复杂命令，其他依赖通过真实制品隔离执行验证。

生成模板后新增模块、`scripts/`、运行数据时，同时检查真实制品。模板默认收集未排除资源，共享 `scripts/artifact_pack.py` 使用 Python 3.11+ 标准库；保留编译型/standalone/static 的运行边界，第三方依赖不因目录新增就自动进入产物。存量项目须一起更新 helper 与构建入口，私有环境/凭据、VCS/agent 状态、缓存、日志、临时和旧制品默认排除；`.artifactignore` 只增加相对 glob 排除，不支持 `!` 包含回退，不能排除已声明入口。实际解压后验证入口，不能仅看 dev 或 ZIP 存在。

Next 生产构建依据显式 `packageManager` 或唯一现有 npm/pnpm 锁选择已安装工具；有锁时 npm ci 或 pnpm frozen install，双锁未选或所选锁缺失但存在其他有效锁明确诊断。两种锁均缺失时保留原首次初始化，明确记录生成锁并在后续构建复用。React/Vue 保留原 pnpm 安装契约。存量 Next 项目同步 `scripts/install-locked.mjs` 与入口；不自动升级管理器。

### 静态产物准备和入口文件

静态 React/Vue 构建完成后使用 `python3 scripts/artifact_pack.py --prepare-dir dist --required index.html` 准备**实际将被平台包装的目录**：排除私有/缓存/`.artifactignore` 条目，物化目录内安全链接，越界或循环失败。随后 `--check-dir dist` 仅作严格只读检查；含被排除条目、未物化链接或目录冒充 `index.html` 时失败。准备期间输入文件或目录变化则失败并保留当前原输出；准备过程使用独立 staging 并在发布失败时恢复原 `dist`；恢复本身失败时保留唯一 `.artifact-backup-*` 及具体诊断，不能把唯一有效备份删掉。只处理派生输出，不搬迁业务源码。

结构明确的本地可执行入口、解释器直接文件入口和 `java -jar` 的 JAR 必须为普通文件；本地可执行入口还须有执行位。资源目录的 required 规则仍允许目录，不能用该规则替代命令文件检查。CLI 生成项目保留文本脚本的原权限，新增脚本后仍需验证真实新制品的直接运行。

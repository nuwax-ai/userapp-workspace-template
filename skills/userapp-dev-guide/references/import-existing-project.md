# 导入已有项目

本指引用于将已有 ZIP 解压内容、Git 项目或业务目录接入 UserApp workspace，也适用于新增未接入模块，以及完整工程误放在平台 `code/` 等子目录的情况；不要求用户曾手动导入。

目标是保留原业务和技术栈，补齐平台构建、运行及路由契约。**不要求项目来自模板，不要求改成模板的分层结构，也不把用户项目替换成新脚手架。**

## 1. 先判断当前状态

平台首次提供的工作目录是固定源码根。第一次执行命令时记录 `SOURCE_WORKSPACE=$PWD`；已经进入子目录时恢复首次记录，不以当前 pwd 重设。后续根 manifest、初始化和 validate 均指向此根。独立客户端的新建目录由用户选择，进入生成目录后记录对应源码根。

| 状态 | 处理 |
|---|---|
| 空的新目录 | 使用 userapp-scaffold 创建所需模板 |
| 新 workspace 仅有 Git/agent 元数据、用户说明或平台预建空目录 | 在原根正常 init；旧版非空拒绝时工作区外临时生成后最小合入原根，保留已有内容，不 force、不再套一层 |
| 平台 `code/` 等子目录内已有完整工程 | 保留业务与依赖，按第 3 节接入原根；不把子目录认作平台源码根 |
| 已有代码，没有根 manifest 或配置不完整 | 按本指引接入 |
| 已有有效 workspace，新增未接入业务模块 | 保留旧服务，增量接入新模块 |
| 已有服务均接入，只需修改功能 | 沿用现有结构增量开发 |

不能只看 `workspace.manifest.toml` 是否存在。先列出用户预期的应用服务，再与实际发现的 manifest 对照；docs、scripts、共享 packages 等不是独立运行服务。

当前 template-cli 负责创建/追加模板，没有接纳任意已有目录的命令。不要编造 `template-cli import/adopt`，不要在已有业务目录用 `init --force` 或 `add --force` 接入原项目。这些操作可能覆盖根配置或删除重建同名目录。

平台可能提供 detect/confirm 辅助接口；detect 只根据描述文件生成建议草稿，不执行构建脚本，但会写入草稿。它不会完成源码、启动或打包适配，也不保证识别 SPA/SSR、真实入口或健康路径。手动导入不以这些接口或界面确认作为必经前置。`project.manifest.draft.toml` 不参与构建，最终必须有正式 manifest。

## 2. 盘点原项目并确定最小改动

在平台提供的当前 workspace 内读取：

- 已有 `AGENTS.md`、`CLAUDE.md` 和 README；保留用户业务规则与明确选择。
- 依赖描述、原锁文件、workspace 配置、构建/启动脚本和必要的 Dockerfile。
- 实际入口、共享模块、静态资源、数据库与其他外部服务依赖。
- 已有 manifest、服务 ID、代理路径及应用正在使用的导航。

列出服务清单：原目录、service_id、实际运行类型、开发/生产命令、对外路径及依赖。看到 `package.json` 不能直接填 `type="node"`：可静态托管的 SPA 是 static；需要服务器进程的 SSR/全栈应用是 node 等进程服务。没有公开路由的常驻任务才考虑 worker，一次性脚本不是常驻 worker。

保留原语言、框架、包管理器、锁文件、Git 历史及共享源码。默认 Python/React 选型只适用于新应用，不能用它迁移导入项目。不要通过改数据库类型或关闭认证来消除适配错误。

常规、非破坏性适配直接执行并说明理由；只有不可推断的业务选择或破坏性改动才澄清。缺少外部服务时指出具体依赖，不能因此拒绝所有可完成的代码接入工作。

## 3. 组织服务目录

平台只扫描 workspace 根的**一级子目录**中的 `project.manifest.toml`。根目录的 project manifest 和更深层 manifest 不会被自动发现。只有需要独立编排的服务目录放 manifest；不要求所有一级目录都放。

### 简单项目

可以将原项目的运行与构建文件整理到 `web/`、`api/` 等一级目录，再在根写 workspace manifest。移动前核对相对引用、脚本 cwd、资源路径和 gitignore；不要使用 `mv *` 搬走 `.git`、用户说明或平台状态目录。也可以使用下面的适配目录方式保留原布局。

### 平台子目录内已有完整 workspace

先比较原根与 `code/` 内的业务、manifest、Git、lock 和共享依赖，查明实际服务。`state/`、`builds/`、`.run/` 及其他平台状态或运行产物保留原位，不能当源码搬走或删除。

保持平台根不变，选择最小接入方式：可在核对相对路径、Git 和既有文件冲突后，将内层 workspace 的源码根文件与服务目录逐项合入原根；也可保留内层业务布局，在原根建立下面的一级编排适配目录，调用已有构建并归集自包含产物。保留业务、锁文件与共享依赖，不复制成两套工程、不覆盖根 AGENTS/CLAUDE，不执行 `init --force` 或通配符整体搬迁。常规可逆适配直接完成；只有实际覆盖冲突或破坏性调整需要澄清。

完成后 `workspace.manifest.toml` 位于 `SOURCE_WORKSPACE`，预期服务能从该根的一级目录发现。对原根执行 validate，并按实际源码路径检查构建、dev 启动与产物布局；内层单独通过不能证明平台接口可构建。

### monorepo 或根目录有共享构建配置

保留原根 package.json、lock、apps/packages 和共享工具链，新增一级编排适配目录：

```text
workspace/
  .git/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  apps/                     原业务目录，保持内部结构
  packages/                 原共享依赖
  workspace.manifest.toml
  admin-web/
    project.manifest.toml
    scripts/build.sh         调用原根构建，收集本服务产物
    dist/
  portal-web/
    project.manifest.toml
    scripts/build.sh
    dist/
```

构建命令默认在服务目录执行，需要调用原根命令时使用明确的脚本或 shell，例如 `command=["sh","scripts/build.sh"]`，由该脚本定位 workspace 根。devrun 同样可以调用原 monorepo 启动命令，但最后必须维持可管理的前台服务，不能通过 nohup/后台分叉假装启动完成。

`[build].artifact` 必须是服务目录内的相对路径，不能填 `../apps/...`。原工具输出在 apps/web/dist 时，构建脚本将它归集到适配服务目录的 dist。不要复制整个工程来创建第二份共享依赖。一个服务 manifest 描述一个独立服务；多个入口分别使用一级适配目录。

## 4. 补齐实际构建与运行契约

根目录写 `workspace.manifest.toml`；服务目录写正式 `project.manifest.toml`。字段不确定时执行 `template-cli docs`，阅读列出的 `03-manifest-reference.md`、`04-pingap-routing.md` 和 `08-worker.md`，不要自创字段。

| 项 | 适配要求 |
|---|---|
| 身份 | service_id 使用唯一 DNS-1123 标识；保留已接入服务的身份，不从用户/会话 ID 推导 |
| 构建 | 复用真实构建命令；命令是 argv，需要 shell 时显式用 sh；不默认套模板脚本名 |
| 产物 | static 是静态目录；进程服务是包含完整运行文件的 ZIP，解包根对应运行 cwd |
| dev | 有 devrun 时明确安装/准备步骤是否已由 devbuild 或原工具完成；仅有 devrun 不会自动执行生产 build |
| prod | 生产 run 在发布服务目录执行，不能依赖未打包的根源码、共享包或开发机依赖 |
| 监听 | HTTP/TCP 进程读取注入 PORT，监听 0.0.0.0；不要静默换端口 |
| 探测 | 按真实 HTTP/TCP/process 行为选择；HTTP 复用廉价真实接口，明确 TCP worker 不强制增加 HTTP 服务 |
| 日志 | 可使用平台收集的 stdout/stderr；需要应用文件日志时对接 APP_LOG_DIR，不强制重写日志框架 |

显式 `startup_probe="http"/"tcp"/"process"` 需要 app-cli >= 0.3.9 和 owner 的 `startup-probe-v1` 能力。不能只改 kind 或探测方式掩盖业务启动失败；process 只证明根进程存活，不证明任务业务成功。managed/extend 工作区需要实际代理服务，不能将纯 worker 假装成 web。

保留原 lock 文件与增量依赖缓存。生产安装按原工程的可重复构建规则执行；不要统一换 npm/pnpm，也不要无条件删 node_modules、Python deps 或缓存。重新生成 ZIP 时避免把已删除的旧文件留在包中。

**发布包必须自包含。** 运行需要的共享模块、依赖、资源、启动/迁移程序要进入各服务制品；平台不会自动把整个源码仓和根 lock/package.json 一起部署。静态案例优先归集为服务内 `artifact="dist"`；嵌套产物路径必须实测目标平台组包和运行布局，不能以配置通过证明路径完整。

## 5. 路由、数据库与入口

- 一个应用有独立域名。原单一前端可以占 `/`，不强制改成 `/react`；多个前端使用唯一 ID/公共路径，具体 API 前缀不与已有页面冲突。
- Vite 的公共资源 base、开发请求、代理 strip 和生产产物布局必须一致。复用已有正确配置；需要子路径或按 TOML 改路由时，最小接入 manifest 路径读取，保留业务插件及 history/hash 路由器。适配目录与 vite.config.ts 不同层时，读取 manifest 的 URL 要指向正确服务目录。
- 不直接覆盖用户 Vite 配置为模板整文件。模板 helper 可作为参考，不是强制业务架构。改公共路径后同时核对浏览器路由、资源 URL、HMR、导航和 API 调用。
- API 按实际代理前缀访问；后端已经自带 `/api` 时核对 strip 是否会重复删除前缀。应用内部同域请求使用合适的相对路径，不把 localhost 业务地址写入浏览器。
- 保留原数据库模型和数据。平台受管理 PG 凭据可能覆盖 POSTGRES_* 和 DATABASE_URL 的用户名/密码；其他 DB 不能假定同名变量会原样透传，应核对实际代码并使用应用专用连接配置。不要悄悄把 MySQL/SQLite 改成 PG。
- 沿用已有可靠迁移机制；不要把原工程所有 SQL 搬进 database/，该目录发布时可能重跑。未知迁移结果不猜测、不重跑；运行环境的 PG 前置策略也不写成所有导入应用的强制依赖。
- 合并 AGENTS 的接入说明，保留用户和 CLAUDE 的既有规则。只在根导航实际生效时维护它；不覆盖原应用首页。iframe 按 dev-guide 和用户选定策略验证，不用删除全部认证、CSP 或 CSRF 来适配。

## 6. 校验、构建和访问验证

先执行 `app-cli validate --help` 确认安装的二进制提供只读校验命令，不能仅凭版本号假定已发布或沙箱已升级。不自行 npm install 或替换平台工具。

支持时对已记录的源码根执行，分别检查生产与开发代理规则；平台不得改用内层 `code/` 或运行目录：

```bash
app-cli validate --workspace "$SOURCE_WORKSPACE"
# 有开发运行方式时另外检查开发代理规则；不放宽生产 manifest 必填项
app-cli validate --workspace "$SOURCE_WORKSPACE" --dev
# 需要结构化诊断时使用；stdout 是单一 JSON 报告
app-cli validate --workspace "$SOURCE_WORKSPACE" --json
```

逐条检查退出码：`0` 配置通过；`1` 配置语法/语义错误；`2` 命令参数错误；`3` 文件观察、DNS/超时、输出或内部失败。报告 `valid` 只代表配置检查；`services_complete=false` 时服务清单不完整，不能声称全部模块通过。核对发现的服务是否覆盖预期模块，未放一级 manifest 的目录不会自动报错。检查失败按具体原因处理，不转用旧 lock 或另一命令掩盖失败。

`validate` 不生成或修改 `release.lock.toml`，不修改配置、状态或日志，不执行构建/迁移/服务命令、不连接数据库。它不读取旧 lock 作为权威，也不检查 dist/zip、依赖安装、端口占用或业务就绪。某些 custom 代理配置的静态 hostname 会触发 DNS，不能称为完全离线检查。

**旧版兼容检查**：仅在安装版本未提供 validate 时，明确记录该能力缺失；核对 `app-cli gen-lock --help` 后可使用既有 `app-cli gen-lock --workspace "$SOURCE_WORKSPACE"`，开发规则另用 `app-cli gen-lock --workspace "$SOURCE_WORKSPACE" --dev`。这会生成或覆盖派生 lock，不能标成只读 validate 已通过。缺少新命令不新增启动/停止门禁，不要求用户删除文件；若既有命令也不可用，报告具体工具缺口。

准备本地编排时仍由 `gen-lock` 生成派生 lock，失败时旧文件可能保留，不沿用旧结果。不要手改该文件，也不要把它当作源码依赖锁：原 pnpm/package-lock、Cargo.lock 等仍须保留。

配置通过不证明实际构建、服务启动或数据库连接。继续验证：

1. **dev**：按真实 devbuild/build 准备并通过平台启动/重启服务，验证修改后的业务。不要只看 build_ok、owner PID 或任务 accepted。
2. **prod**：执行完整 build 并检查产物，使用隔离发布目录运行；确认没有借用原源码树、开发 node_modules 或共享包。
3. **访问**：检查实际页面/API/任务结果。前端检查真实 JS/CSS Content-Type、资源、深链接及 HMR，多前端用不同页面内容确认不串路由；首页 200 不能代替这些检查。
4. **回归**：增量导入时旧服务、导航和业务仍正常；再次接入不重复建服务或改旧 ID。

独立本地环境可按 dev-guide 的本地运行章节使用 `build --dev` 与源码态 serve，或 `build --deploy-dir .local-deploy` 与产物态 serve；两种方式分别验证，不同时启动。平台有 owner 时优先使用平台控制，不通过 kill/pkill、删除记录/锁文件或换管理端口绕过所有权保护。

### 失败任务与诊断

平台构建、启动或重启的失败响应仍可能含可回查任务，不能只看 HTTP 状态或顶层 message。保留原 `code`、`message`、`data.diagnostics` 和 `data.task_id`；工具封装响应时相应数据可能位于 `error.data`。使用平台提供的 app_id：

```text
GET /api/v1/userapp/tasks/{task_id}?app_id=...
GET /api/v1/userapp/tasks/{task_id}/logs/stream?app_id=...
```

任务快照与 SSE 用于核对本次终态和日志；已经 failed/cancelled 的任务不因重试变成成功。`task_id=null` 表示未保留可查询任务，按现有容量等诊断处理，不虚构 ID。错误中已有 operation/recovery 身份时保留，并使用平台支持的同操作恢复入口；未知迁移或清理结果不能靠新建任务掩盖。

| 诊断 | 下一步 |
|---|---|
| `repair_target=project` | 对照 `file`、`field`、`service_id`、message/hint 和真实项目入口做最小修正；缺少的位置字段不自行猜造 |
| `repair_target=platform` | 核对原根和服务清单，使用平台提供的恢复/重试操作；仍失败时报告诊断及操作身份，不改项目去迁就平台错误 |
| `scope=task` | 查看任务的 `workspace` 范围日志；service_id 可以为空，它不是某个业务服务的失败 |
| `scope=service` | 查看诊断中真实 service_id 的日志；service_id 不等于目录名 |

`workspace_root` 是平台配置的源码根，`detected_workspace_root` 是观察到的工程位置，二者都不是自动移动文件的指令。原根 manifest 和一级服务已正确时，owner 仍指向旧 `code/` 是平台恢复问题；不能反向把源码搬到旧根，也不能修改平台环境、删除 owner journal/状态/锁或 pkill 解锁。只有项目确实未接入原根时才按第 3 节适配，保留业务、Git、依赖锁、共享依赖、平台状态及数据。

项目侧常规非破坏性修正直接完成。支持 validate 的安装版在原根执行 `app-cli validate --workspace "$SOURCE_WORKSPACE" --dev --json`，核对退出码、`services_complete` 和预期服务；生产规则另外检查。然后按本节完成真实构建、平台启动/重启、页面/API/worker 业务验证，分别记录结果。平台故障受阻时明确未完成的运行验证，继续不依赖故障环境的项目工作，不把 validate 通过称为部署成功。

## 7. 三个适配案例与完成记录

| 案例 | 必须确认 |
|---|---|
| 根目录 Vite SPA | 原页面和锁文件保留；一级服务被发现；dev 资源/HMR 与 prod 资源可访问 |
| SPA + 后端 | 真实服务边界与依赖；前端相对路径 API 成功；发布产物不依赖源码目录 |
| 已有 monorepo 新增第二前端 | root lock/workspaces/shared 保留；旧 ID/业务不变；不同页面不串路由；再次适配不重复服务 |

汇报时列出原目录到服务的映射、必要改动、实际执行命令及结果，分别说明配置、构建、启动、业务访问和未验证项。缺数据库、浏览器、目标运行时或发布环境时记录具体缺口，不把“配置文件已生成”或“草稿已确认”当作可用。

验证 agent 适配能力时，从未适配原项目的独立副本开始，记录实际提示词/skill 版本、读取轨迹、修改与真实请求；人工完成后让 agent 复查，不算 agent 自行完成导入适配。

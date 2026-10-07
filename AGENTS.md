# UserApp Workspace Template — Agent Guide

本仓库是 RCoder UserApp 平台的 **workspace 模板源 + CLI 脚手架**。

## 项目结构

```
userapp-workspace-template/
├── workspace.manifest.toml          # 开发用 workspace(含全部模板)
├── index.html                       # 开发用 workspace 的入口首页(根路径兜底,改完刷新即生效)
├── database/                        # workspace 根 SQL 约定目录(发布时平台自动执行,规则见其 README)
├── backend-go/                      # Go (Gin + GORM) 后端模板源
├── backend-java/                    # Java (Spring Boot + MyBatis-Plus) 后端模板源
├── backend-python/                  # Python (FastAPI + SQLAlchemy) 后端模板源
├── worker-python/                   # Python 纯进程 worker(需配套 app-cli 0.3.9)
├── backend-rust/                    # Rust (Axum + sqlx) 后端模板源
├── frontend-react-vite/             # React 18 + Vite 前端模板源
├── frontend-vue3-vite/              # Vue 3 + Vite 前端模板源
├── userapp-next-template/           # Next.js 16 全栈单体模板源
├── cli/                             # @nuwax-ai/template-cli 脚手架包
│   ├── src/                         # CLI 源码(TypeScript)
│   ├── scripts/                     # pack-templates.mjs(打包) + release.mjs(发版)
│   └── templates/                   # [pack 产物] 参数化模板(gitignore)
├── docs/                            # UserApp 平台开发者文档
├── skills/                          # AI Agent skills
│   ├── userapp-scaffold/            # CLI 脚手架使用指南
│   └── userapp-dev-guide/           # 平台开发规范(manifest/路由/部署/排错/app-cli 本地开发测试)
├── prompts/                         # 沙箱 agent 系统提示词(平台注入用,见 prompts/README.md)
├── .github/workflows/               # CI(ci-cli.yml + release-cli.yml)
└── README.md                        # workspace 模型 + manifest 字段参考
```

## 平台核心约束(开发时必须遵守)

1. **HTTP/TCP 进程服务保留 `0.0.0.0:$PORT` 监听与健康接口** — 不能硬编码端口。`kind=worker` 仅表示不公开代理路由,不表示删除内部健康服务；不能只改 kind 就把 HTTP worker 改成无监听循环。app-cli >= 0.3.9 才支持显式 `startup_probe="process"` 的无监听 worker，见 docs/08-worker.md。`type=static` 的 prod 由平台托管,不启动业务进程
2. **两级 manifest** — workspace 根目录 `workspace.manifest.toml`,参与编排的一级服务目录各有 `project.manifest.toml`；其他目录无需 manifest。根目录或更深层的服务 manifest 不会直接被发现
3. **严格校验,Fail Fast** — 未知字段/非法枚举/重复路由/依赖环 → 构建直接失败
4. **service_id 是稳定身份** — 不是目录名,决定日志目录/路由 upstream/依赖引用
5. **回滚不执行 down migration** — 迁移必须幂等 + expand/contract
6. **database/ 目录 = 发布时自动执行的 SQL** — 根 `database/` 先、子项目按目录字典序,
   文件名字典序;SQL 须幂等,单文件失败仅日志不阻断发布;**开发阶段不自动执行**,
   schema 变更需手动执行后再放入。详见 [database/README.md](database/README.md)

> 完整字段参考、路由规划、健康检查、日志、部署回滚等,
> 参考 **docs/** 目录或 **userapp-dev-guide** skill。

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

静态 React/Vue 构建完成后使用 `python3 scripts/artifact_pack.py --prepare-dir dist --required index.html` 准备**实际将被平台包装的目录**：排除私有/缓存/`.artifactignore` 条目，物化目录内安全链接，越界或循环失败。随后 `--check-dir dist` 仅作严格只读检查；含被排除条目、未物化链接或目录冒充 `index.html` 时失败。准备期间输入文件或目录变化则失败并保留当前原输出；准备过程使用独立 staging 并在发布失败时恢复原 `dist`；恢复本身失败时保留唯一 `.artifact-backup-*` 及具体诊断，不能把唯一有效备份删掉。只处理派生输出，不搬迁业务源码。

结构明确的本地可执行入口、解释器直接文件入口和 `java -jar` 的 JAR 必须为普通文件；本地可执行入口还须有执行位。资源目录的 required 规则仍允许目录，不能用该规则替代命令文件检查。CLI 生成项目保留文本脚本的原权限，新增脚本后仍需验证真实新制品的直接运行。


打包前仅核对 `run.command`、`run.migrate` 中结构明确的相对本地可执行文件、已识别解释器的直接文件入口及 `java -jar` 的 JAR；缺失、被排除、链接逃逸或目录循环立即构建失败。不把任意 argv 数据参数当作路径，不解析 shell `-c`、解释器 `-c`/`-m` 或带选项的复杂命令。ZIP 独立生成后原子替换，失败保留旧有效 ZIP，重新构建不遗留已删除条目。自定义 shell 字符串、动态导入及外部依赖仍需实际运行验证：将**真实新制品**解压到隔离于源码/开发依赖的目录，用其生产入口和安全测试数据库执行必要迁移，再核对业务访问；迁移告警继续启动不代表制品可以漏脚本。

验证报告须分别记录真实 ZIP/目录包装与隔离执行、语言/框架编译、平台启动/访问的结果；包装 fixture 通过不能代替完整框架构建或平台验收。

Next 生产构建尊重显式 `packageManager`（已安装的 npm/pnpm 精确版本）或唯一现有锁文件：npm 使用 `npm ci`，pnpm 使用 `pnpm install --frozen-lockfile`。双锁未声明选择时明确报歧义；声明的管理器缺少对应锁而存在其他锁时，不忽略有效锁或静默切换。两种锁均缺失时，保留模板原有首次安装初始化流程，明确记录本轮无锁输入、生成的锁及摘要，后续构建复用该锁。React/Vue 保留既有 pnpm 安装/首次初始化契约。存量 Next 项目同步 `scripts/install-locked.mjs` 与构建入口；CLI pack 随 Next 模板复制安装器，不自动升级管理器或改锁版本。

共享 helper 的维护源是 `backend-python/scripts/artifact_pack.py`；改动后同步各模板副本，CLI pack 会把这份源文件复制进每个生成模板的 `scripts/`。存量应用需一起更新构建入口与 helper，CLI/模板升级不自动改写旧项目。

## app-cli 运行控制边界

实际 app-cli >= 0.3.16 使用统一持久 `serve` owner；`run` 经同一控制链提交操作，不直接另起编排。Stop 取消启动意图并确认业务退出后保留管理面，旧构建与迟到回调不能重新启动业务。交互优雅退出宽限上限为 3 秒，manifest 的 `shutdown_timeout_seconds` 默认 30 保留；3 秒不是整个构建、RPC 或恢复的预算。

应用 `run.migrate` 失败仅在进程/后代退出与清理已确认后告警并继续启动。父 Stop/取消、清理未确认或不可逆写入结果未知保持对应保护，不自动重放未知写入；具体边界见 [database/README.md](database/README.md)。文档和 CLI 模板更新不证明沙箱二进制、已安装技能及注入提示词已同步。

## Skills 安装

本仓库提供 2 个 skill,供 AI Agent 在 UserApp 项目开发时使用:

```bash
# 安装全部 2 个 skill(推荐)
npx skills add https://github.com/nuwax-ai/userapp-workspace-template/tree/main

# 或从本地路径安装(开发时)
npx skills add . --agent zcode --copy
```

| Skill | 用途 |
|---|---|
| `userapp-scaffold` | 用 CLI 创建/追加 workspace service(工具型) |
| `userapp-dev-guide` | 已有项目接入/manifest 配置/路由/健康检查/日志/部署/排错/app-cli 本地开发测试(知识型) |

## CLI 脚手架

用 `@nuwax-ai/template-cli` 按需组合模板生成 workspace:

```bash
# 发布在 npm(用户用)
npx @nuwax-ai/template-cli list backend    # 查看可用模板(backend / frontend)
npx @nuwax-ai/template-cli init my-app --backend python --frontend react
npx @nuwax-ai/template-cli add backend-rust

# 本地开发(改了 CLI 源码后)
(cd cli && npm run build && npm run pack)
node cli/dist/index.js init /tmp/test --backend java
```

## 已有项目适配

已有源码手动导入后,先读取原项目规则、构建入口和依赖文件,使用现有 `userapp-dev-guide` 的
[已有项目接入指引](skills/userapp-dev-guide/references/import-existing-project.md) 增量适配。
保留原技术栈、业务、Git、根 lock 文件与 monorepo 共享依赖；可用一级适配目录调用原根构建。
`init` 用于空目录或仅有 Git、平台/agent 元数据及用户说明的目录，默认保留已有说明和配置。
平台工作区契约实际返回的 `workspace_root` 是唯一源码权威；先核对 cwd 与其一致再记录 `SOURCE_WORKSPACE=$PWD`，进入服务目录后不重新赋值。在该根执行 `init .`；不能因元数据非空而改到 `code/` 或应用名子目录。
已有业务或嵌套 workspace 按接入指引适配，不得用 `--force` 覆盖已有代码。

已有 detect 只是不执行项目脚本的辅助检测,但会写入草稿；不假定 ZIP 导入自动执行 detect 或存在确认界面。
草稿不参与编排,须核对实际命令、产物和路由。先用 `app-cli validate --help` 核对安装能力,
支持时运行 `app-cli validate --workspace .` 和 `app-cli validate --workspace . --dev` 做只读配置检查。
`gen-lock` 负责生成派生 lock；未提供 validate 的旧版兼容检查见导入指引,不自行替换沙箱工具。
配置通过后仍须验证实际构建和运行,不新增启动/停止门禁。

## 各模板的 Agent 约定

| 模板 | Agent 文件 | 命令契约 |
|---|---|---|
| frontend-react-vite | `AGENTS.md` / `CLAUDE.md` | `pnpm check` 必过 |
| frontend-vue3-vite | `AGENTS.md` / `CLAUDE.md` | `pnpm check` 必过 |
| userapp-next-template | `AGENTS.md` / `CLAUDE.md` | 读 `node_modules/next/dist/docs/` |
| backend-go | README "如何加业务模块" | `internal/{model,repository,service,handler}/` 分层 |
| backend-java | README "如何加业务模块" | `model/mapper/service/web/` 分层 |
| backend-python | README "如何加业务模块" | `app/{models,repositories,services,routers}/` 分层 |
| backend-rust | README "如何加业务模块" | `src/{domain,repository,service,handlers}/` 分层 |

## 发版流程

```bash
cd cli

# 已发布正式版的补丁升级，同时更新 package.json 和 package-lock.json
npm version patch --no-git-tag-version
npm run build && npm run pack && npm test

# 回到仓库根，逐项核对并提交本次变更（含上述两个版本文件）
cd ..
git diff --check
# 提交完成后，tag 必须与已提交的 cli/package.json 版本一致
# 例如版本为 0.1.18：
git tag v0.1.18
git push origin main refs/tags/v0.1.18
```

beta 使用明确的新版本号（如 `npm version 0.1.19-beta.1 --no-git-tag-version`），其余校验、提交和
推送步骤相同。已有 tag/npm 版本不覆盖；不要批量推送与本次发布无关的 tag。
推送后核验 GitHub Actions 发布任务、npm dist-tag 和实际 CLI 版本，才算发布完成。

Tag 规则:
- `v0.1.0-beta.1` → npm dist-tag: `beta`
- `v0.1.0` → npm dist-tag: `latest`

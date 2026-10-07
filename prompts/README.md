# prompts/ — 沙箱 Agent 系统提示词

本目录存放 UserApp 平台沙箱 AI agent 的**系统提示词**，纳入 git 追踪以便版本化管理。

## 文件说明

- `sandbox-system-prompt.md` — 注入给沙箱 agent 的常驻系统提示词（角色、workspace 心智模型、
  5 步工作流、平台契约、自检与汇报规范）。应用 ID 与会话 ID 由平台分别提供；
  提示词不使用会话/用户占位符推导应用身份或目录，也不引入平台尚未提供的新占位符。

## 与其他 Agent 材料的分工

| 材料 | 加载方式 | 职责 |
|---|---|---|
| 本目录系统提示词 | 平台注入，每会话常驻 | 全局工作流、铁律、自检/汇报规范 |
| `skills/userapp-scaffold`、`skills/userapp-dev-guide` | 按需触发（沙箱预装或 `npx skills add` 安装） | scaffold 创建模板；dev-guide 提供导入适配、manifest、路由、运行等规范 |
| CLI `init` 生成的 workspace `AGENTS.md` | 随生成的 workspace 就地读取 | 该 workspace 的结构、路由表、追加 service 方法 |

这些文件只约定平台契约和默认开发方式。修正旧的生成说明时保留用户补充的业务规则；
模板默认技术栈、首页形式和 iframe 策略不能覆盖用户的明确选择。

## 修改与同步

1. 直接修改 `sandbox-system-prompt.md` 并 commit（本仓库即唯一正源）。
2. 修改后需**同步到平台注入链路**（rcoder 侧的 agent system prompt 配置 / 请求级
   `system_prompt_override`），沙箱不会拉取本仓库。
3. 同步平台 agent-store 中实际安装的两份 skills 及完整 references，并核对会话是否加载了新内容；npm 发布不会刷新 agent-store，CLI 新生成的 AGENTS 也不会替换存量技能。
4. 铁律/规则类变更请同步检查 `skills/`、根 `README.md` 与 `cli/src/manifest.ts`
   （generateAgentsMd）中的对应表述，避免多处漂移。

> 本目录不进入 npm 包（`cli/package.json` files 白名单不含它），也不会被
> `template-cli init/add` 复制进生成的项目（CLI 只释放 `cli/templates/<id>/` 与显式生成的
> workspace 根文件）。

### 平台源码根约定

平台工作区契约（文件/chat 接口实际返回的 `workspace_root`）决定唯一源码根；先核对当前 cwd 与该根一致，再记录 `SOURCE_WORKSPACE=$PWD`。初始化与完成后的 validate 都使用同一源码根。平台预建空 `code/`、状态和产物目录不改变根；独立客户端按用户选择的新目录初始化。已有内层完整工程走导入适配，保留业务并接入原根。该约定须同时进入实际注入的系统提示词、agent-store 的 scaffold/dev-guide 与 CLI 生成的 AGENTS；修改仓库文件或发布 npm 包只完成其中对应的制品更新，不证明现场会话已生效。

### 导入已有项目的指引同步

导入适配扩展已有 `userapp-dev-guide`，没有第三个 skill。其 `references/import-existing-project.md` 是详细指引的唯一正文；安装/复制该技能时必须包含整个 references 目录。`make build-skills` 的 ZIP 包含它，平台只复制 SKILL.md 不足以启用完整流程。

CLI pack 将这份正文导出为随 npm 分发的 `docs/07-import-existing-project.md`；仓库 docs 下同名文件仅作导航。两份分发物须核对正文一致，缺正文不得发布。只有更新 npm 不会更新已安装 skill 或平台实际注入的系统提示词；项目 ZIP 导入也不是安装技能的替代方式。存量 workspace 只合并接入说明，不重生成覆盖用户 AGENTS/CLAUDE。

配置检查优先使用只读 `validate`，通过 `app-cli validate --help` 核对实际二进制能力，不能仅凭版本号认定已发布。旧版未提供该命令时可按导入正文使用已有 gen-lock，并明确会写派生 lock、失败不能沿用旧结果；不自行替换沙箱工具，不新增启动/停止门禁。

### 失败诊断契约同步

系统提示词与两份现有 skills 按 `diagnostics[].repair_target` 区分项目适配和平台 owner/配置恢复，详细步骤维护在 [导入指引的失败任务与诊断](../skills/userapp-dev-guide/references/import-existing-project.md#失败任务与诊断)。平台返回失败时仍读取 `data.task_id`（工具封装下可能为 `error.data.task_id`），使用原 app_id 回查 GET/SSE；`scope=task` 对应 `workspace` 日志，服务诊断使用真实 service_id。

同步时同时核验后端实际响应、已安装 skill/reference 与注入提示词；文档更新不代表目标平台已支持这些字段。原根配置正确而 owner 根错误属于平台修复，不能引导 agent 搬代码或清理状态绕过。项目修正后在原根运行 `validate --dev --json` 并核对预期服务，再完成真实构建、启动及访问验证；保留现有工具能力检查。

### app-cli 命令契约同步

提示词与 `userapp-dev-guide` 采用 `app-cli <子命令> <参数>`，且平台已有运行实例时不再引导 agent 额外启动编排器。
更新部署时须同步三个入口：沙箱中的 app-cli 二进制、已安装/复制的 skills、平台实际注入的系统提示词。
先确认二进制支持 `validate --workspace`（或明确使用旧版兼容检查）、`gen-lock --workspace`、`build --workspace`、`serve --workspace`，并分别核对配置与运行验证结果；本仓库文件修改不会自动更新运行中的沙箱或平台配置。

新版 workspace 优先级为 `--workspace` → `APP_CLI_WORKSPACE` → 启动 cwd；旧版以安装二进制 help 为准。平台提示词仍固定显式传 `SOURCE_WORKSPACE`，不能因默认值改为 cwd 就让服务子目录覆盖应用根；生产入口继续显式传运行目录。

### app-cli >= 0.3.16 的 owner、停止与迁移边界

`serve` 是持久运行控制 owner，`run` 通过统一控制链提交原操作，不直接前台编排。已有核验为同应用的 owner 时复用，没有 owner 时取得稳定内核锁并完成必要恢复；不能按锁文件存在、裸 PID 或管理端口拒连判断归属或清理完成。

业务 Stop 取消启动意图并确认受管业务停止后保留管理面；没有业务执行时重复 Stop 幂等成功，旧构建与迟到回调不能再启动业务。交互优雅退出宽限上限为 3 秒，`shutdown_timeout_seconds` 的 schema 默认 30 保留；构建、RPC、恢复各阶段仍共享父请求 deadline。

应用 `run.migrate` 失败仅在进程/后代退出与清理已确认后告警并继续启动，原任务/操作身份与日志保留；父取消、清理未确认及迁移或平台 DBAdmin 的未知不可逆写入仍保持对应保护，不能自动重放未知写入。升级需分别核对实际沙箱 app-cli 版本、已安装 skills/reference、平台注入提示词及新生成的说明；仅发布 npm 模板不会更新其他分发面。

### React/Vue 路由契约同步

template-cli 0.1.14 将本模块 `[proxy].path` 作为 Vite dev/build base 的唯一来源，
并生成 `strip_prefix = true`、`dev_strip_prefix = false`。运行时需要 app-cli ≥ 0.3.7
及支持该字段的 RCoder。`skills/`、系统提示词和生成的 `AGENTS.md` 已统一为该规则。
存量项目需先按 `docs/04-pingap-routing.md` 接入 helper 和依赖，不能只套用新提示词。

安装 skills 时明确使用本仓库 `main` 分支：

```bash
npx skills add https://github.com/nuwax-ai/userapp-workspace-template/tree/main
```

平台预装/复制的 skills 与注入的系统提示词仍须单独同步，不随 npm 发布自动更新。

### Worker 契约同步

`backend-python --kind worker` 保留内部 HTTP 健康服务和 `$PORT` 监听，只是不公开 `[proxy]`。
当前模板源码还包含 `worker-python`，它显式声明 `startup_probe="process"`，不要求 HTTP 监听。

使用 process worker 前核对实际安装的 CLI 是否提供该模板、app-cli >= 0.3.9，以及 owner 的
`startup-probe-v1` 能力。源码包含模板不代表目标环境已升级；不根据“开发分支/已发布”等历史描述猜测。
条件和迁移见 [worker 说明](../docs/08-worker.md)。

升级需要分别核对 npm 生成物、沙箱安装的两份 skills、平台实际注入的系统提示词。存量 workspace 的 `AGENTS.md` 和应用自建设计文档不会被自动更新；只修正相关 worker 条款，保留用户自己的规则和代码。已经改成无监听循环的应用，应按实际能力恢复 HTTP 健康服务或显式迁移为 process worker，并验证启动与任务行为；只更新说明不代表应用已修复。

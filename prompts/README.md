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
| `skills/userapp-scaffold`、`skills/userapp-dev-guide` | 按需触发（沙箱预装或 `npx skills add` 安装） | 详细规范：manifest 字段、路由、日志、app-cli 等 |
| CLI `init` 生成的 workspace `AGENTS.md` | 随生成的 workspace 就地读取 | 该 workspace 的结构、路由表、追加 service 方法 |

这些文件只约定平台契约和默认开发方式。修正旧的生成说明时保留用户补充的业务规则；
模板默认技术栈、首页形式和 iframe 策略不能覆盖用户的明确选择。

## 修改与同步

1. 直接修改 `sandbox-system-prompt.md` 并 commit（本仓库即唯一正源）。
2. 修改后需**同步到平台注入链路**（rcoder 侧的 agent system prompt 配置 / 请求级
   `system_prompt_override`），沙箱不会拉取本仓库。
3. 铁律/规则类变更请同步检查 `skills/`、根 `README.md` 与 `cli/src/manifest.ts`
   （generateAgentsMd）中的对应表述，避免多处漂移。

> 本目录不进入 npm 包（`cli/package.json` files 白名单不含它），也不会被
> `template-cli init/add` 复制进生成的项目（CLI 只释放 `cli/templates/<id>/` 与显式生成的
> workspace 根文件）。

### app-cli 命令契约同步

提示词与 `userapp-dev-guide` 采用 `app-cli <子命令> <参数>`，且平台已有运行实例时不再引导 agent 额外启动编排器。
更新部署时须同步三个入口：沙箱中的 app-cli 二进制、已安装/复制的 skills、平台实际注入的系统提示词。
先确认二进制支持 `gen-lock --workspace`、`build --workspace`、`serve --workspace`，再启用新版技能与提示词；本仓库文件修改不会自动更新运行中的沙箱或平台配置。

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

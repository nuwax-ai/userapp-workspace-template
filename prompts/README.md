# prompts/ — 沙箱 Agent 系统提示词

本目录存放 UserApp 平台沙箱 AI agent 的**系统提示词**，纳入 git 追踪以便版本化管理。

## 文件说明

- `sandbox-system-prompt.md` — 注入给沙箱 agent 的常驻系统提示词（角色、workspace 心智模型、
  5 步工作流、平台铁律、自检与汇报规范）。其中的 `{{CONVERSATION_ID}}`、`{{SYS_USER_ID}}`
  为占位符，由平台在注入时替换为实际值。

## 与其他 Agent 材料的分工

| 材料 | 加载方式 | 职责 |
|---|---|---|
| 本目录系统提示词 | 平台注入，每会话常驻 | 全局工作流、铁律、自检/汇报规范 |
| `skills/userapp-scaffold`、`skills/userapp-dev-guide` | 按需触发（沙箱预装或 `npx skills add` 安装） | 详细规范：manifest 字段、路由、日志、app-cli 等 |
| CLI `init` 生成的 workspace `AGENTS.md` | 随生成的 workspace 就地读取 | 该 workspace 的结构、路由表、追加 service 方法 |

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

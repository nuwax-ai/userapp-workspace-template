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
2. **两个 manifest** — 根目录 `workspace.manifest.toml`,每个一级子目录 `project.manifest.toml`
3. **严格校验,Fail Fast** — 未知字段/非法枚举/重复路由/依赖环 → 构建直接失败
4. **service_id 是稳定身份** — 不是目录名,决定日志目录/路由 upstream/依赖引用
5. **回滚不执行 down migration** — 迁移必须幂等 + expand/contract
6. **database/ 目录 = 发布时自动执行的 SQL** — 根 `database/` 先、子项目按目录字典序,
   文件名字典序;SQL 须幂等,单文件失败仅日志不阻断发布;**开发阶段不自动执行**,
   schema 变更需手动执行后再放入。详见 [database/README.md](database/README.md)

> 完整字段参考、路由规划、健康检查、日志、部署回滚等,
> 参考 **docs/** 目录或 **userapp-dev-guide** skill。

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
| `userapp-dev-guide` | manifest 配置/路由/健康检查/日志/部署/排错/app-cli 本地开发测试(知识型) |

## CLI 脚手架

用 `@nuwax-ai/template-cli` 按需组合模板生成 workspace:

```bash
# 发布在 npm(用户用)
npx @nuwax-ai/template-cli list backend    # 查看可用模板(backend / frontend)
npx @nuwax-ai/template-cli init my-app --backend python --frontend react
npx @nuwax-ai/template-cli add backend-rust

# 本地开发(改了 CLI 源码后)
cd cli && npm run build && npm run pack
node cli/dist/index.js init /tmp/test --backend java
```

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

# 发测试版(自动 bump beta 号 + 打 tag)
npm run release:beta

# 发正式版(去掉 beta 后缀 + 打 tag)
npm run release

# 推送触发 CI 自动发布到 npm
git push origin main --tags
```

Tag 规则:
- `v0.1.0-beta.1` → npm dist-tag: `beta`
- `v0.1.0` → npm dist-tag: `latest`

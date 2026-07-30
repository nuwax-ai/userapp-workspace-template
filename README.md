# UserApp Workspace Manifest v1 模板

一个 workspace 对应一个 `app_id`，可组合 Next.js、React/Vue SPA 和 Go/Java/Python/Rust
后端。平台自动发现一级子目录中的正式 `project.manifest.toml`，整个 workspace 一起构建、
发布和回滚。

核心约定：

- workspace 和 project manifest 都必须声明 `schema_version = 1`。
- `service_id` 是稳定服务身份；端口在构建时确定并写入 `release.lock.toml`。
- build/run/migrate 都是 argv 数组，不经过隐式 shell。
- 服务监听 `0.0.0.0:$PORT`，日志写入 `$APP_LOG_DIR`。
- Pingap 默认 managed，统一入口为 `:9080`。
- 文件日志按 `[[logs.sources]]` 声明，平台通过 POST 快照或 POST SSE 聚合查询。
- `project.manifest.draft.toml` 不参与构建，确认后才改为正式文件。

仓库中的七个子项目用于覆盖多前端、多后端的最复杂组合。实际应用可删除不需要的目录；
只要至少保留一个 enabled 服务即可。

完整协议和发布说明见 rcoder：

- `docs/userapp-development-design.md`
- `docs/userapp-workspace/`

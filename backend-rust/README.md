# backend-rust

Axum + sqlx 后端模板。分层：`domain → repository → service → handlers`，全局 `tower-http` 中间件 + `tracing` 日志（按天滚动）。

## 本地运行

```sh
cargo build --release
export PORT=8080 POSTGRES_USER=app POSTGRES_PASSWORD=app POSTGRES_DB=app
export LOG_LEVEL=info APP_LOG_DIR=logs      # 平台注入 APP_LOG_DIR；LOG_DIR 为本地兜底
./target/release/server
```

日志：
- stdout：可读文本
- `$APP_LOG_DIR/backend-rust.log.YYYY-MM-DD`：JSON，按天轮转（启动时清理 14 天前的滚动文件）

OpenAPI：`/api-docs/openapi.json`（Swagger UI 见 `/docs`）

## 构建产物

```sh
sh scripts/build-standalone.sh   # → artifact.zip（根目录含 server）
```

## 构建与网络

构建期**零外网依赖**：swagger-ui 资源经 `utoipa-swagger-ui` 的 `vendored` feature 随 crate 内嵌（平台沙箱禁止直连 GitHub）。

之后若新增"构建期从 GitHub 下载资源"的依赖，按优先级处理：

1. 优先使用该依赖自带的离线/vendored 类 feature（同 swagger-ui 的做法）；
2. 否则把下载 URL 前拼沙箱注入的镜像源，如
   `SWAGGER_UI_DOWNLOAD_URL="${GITHUB_MIRROR_URL}https://github.com/swagger-api/swagger-ui/archive/refs/tags/v5.17.14.zip"`。
   注意：必须是**带 `dist/` 子目录的 GitHub tag archive**，官方 release 的 `swagger-ui-dist.zip` 解不出文件会导致构建失败。

## 中间件（外 → 内）

1. `SetRequestId` / `PropagateRequestId`（`X-Request-Id`）
2. `TraceLayer`（请求/响应/失败日志 + span）
3. `TimeoutLayer`（`REQUEST_TIMEOUT_SECS`，默认 30s）
4. `CompressionLayer`（gzip）

## 如何加业务模块

1. `src/domain/` 领域模型  
2. `src/repository/` SQL / 持久化  
3. `src/service/` 业务规则与校验  
4. `src/handlers/` HTTP 适配  
5. 在 `src/routes.rs` 注册路由  

生产环境可将 `db::ensure_schema` 换成 `sqlx migrate`。

# backend-rust

Axum + sqlx 后端模板。分层：`domain → repository → service → handlers`，全局 `tower-http` 中间件 + `tracing` 日志（按天滚动）。

## 本地运行

```sh
cargo build --release
export PORT=8080 POSTGRES_USER=app POSTGRES_PASSWORD=app POSTGRES_DB=app
export LOG_LEVEL=info LOG_DIR=logs
./target/release/server
```

日志：
- stdout：可读文本
- `logs/backend-rust.YYYY-MM-DD.log`：JSON，按天轮转

## 构建产物

```sh
sh scripts/build-standalone.sh   # → artifact.zip（根目录含 server）
```

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

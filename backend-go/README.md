# backend-go

Gin + GORM 后端模板。监听 `0.0.0.0:$PORT`，连接内置 PostgreSQL，提供 `/health` 与 `items` 全 CRUD（逻辑删除）。

内置中间件：`X-Request-Id`、访问日志、Recover；`slog` + lumberjack（`LOG_DIR`，默认 `logs/`）。

## 本地运行

```sh
# 需可用的 Postgres（默认 localhost:5432 / dev:dev/dev，与平台容器 PG 初始凭据一致）
export PORT=8080 POSTGRES_USER=dev POSTGRES_PASSWORD=dev POSTGRES_DB=dev
go run ./cmd/server
```

## 构建产物

```sh
sh scripts/build-standalone.sh   # → artifact.zip（根目录含 server）
```

## 如何加业务模块

1. `internal/model/` 加实体  
2. `internal/repository/` 加数据访问  
3. `internal/service/` 加业务  
4. `internal/handler/` 加路由处理，在 `cmd/server/main.go` 注册  

生产环境可将 `internal/db.EnsureSchema` 换成 golang-migrate / goose。

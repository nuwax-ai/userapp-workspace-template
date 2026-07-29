# backend-python

FastAPI + SQLAlchemy 2（async）后端模板。监听 `0.0.0.0:$PORT`，连接内置 PostgreSQL，提供 `/health` 与 `items` 全 CRUD（逻辑删除）。

内置：`X-Request-Id` 中间件 + 访问日志；日滚文件日志（`LOG_DIR`，默认 `logs/`）。

## 本地运行

```sh
pip3 install -r requirements.txt
# 或使用构建方式：sh scripts/build-standalone.sh 后依赖在 deps/
export PORT=8080 POSTGRES_USER=app POSTGRES_PASSWORD=app POSTGRES_DB=app
python3 main.py
```

## 构建产物

```sh
sh scripts/build-standalone.sh   # → artifact.zip（main.py + app/ + deps/）
```

## 如何加业务模块

1. `app/models/` 实体  
2. `app/schemas/` Pydantic DTO  
3. `app/repositories/` + `app/services/`  
4. `app/routers/` 新路由，在 `app/main.py` `include_router`  

生产环境可将 `app/db.ensure_schema` 换成 Alembic。

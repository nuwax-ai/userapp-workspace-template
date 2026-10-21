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
sh scripts/build-standalone.sh   # → artifact.zip（源码、scripts/、运行资源 + deps/）
```

依赖清单和 Python ABI/平台未变化、`deps/` 文件完整时，直接复用依赖，不访问 pip。
需要重新安装时，下载缓存放在子项目 `.pip-cache/`，随工作区持久化。
`deps/`、缓存和 stamp 均不提交 Git；发布包默认包含未排除的模块、`scripts/`、运行资源及 `deps/`，不再限制于三个固定入口。
每次重新生成 ZIP，已删除的源码不会留在旧产物中。依赖安装失败不会替换原有 `deps/`。

修改依赖后同步 `requirements.lock`。需要强制重装时删除 `.deps-stamp`，保留 `.pip-cache/` 可减少下载。
锁文件使用精确版本时才直接复用 `deps/`；包含范围版本、`-r`/`-c` 外部文件或本地可编辑依赖时仍运行 pip，使用持久下载缓存，避免漏掉外部输入变化。

打包需要 Python 3.11+ 标准库。排除、安全链接及产物态自检见 [生产制品与运行资源](../docs/06-deploy-release.md#生产制品与运行资源)。

存量应用需一起更新 `scripts/build-standalone.sh`、`scripts/build-standalone.py`、`scripts/artifact_pack.py` 和 `.gitignore`；模板升级不会自动改写已有应用。

> 构建脚本不跑 pytest 以加快打包。生产 CI 建议单独跑 `pytest tests/`。

## 如何加业务模块

1. `app/models/` 实体  
2. `app/schemas/` Pydantic DTO  
3. `app/repositories/` + `app/services/`  
4. `app/routers/` 新路由，在 `app/main.py` `include_router`  

生产环境可将 `app/db.ensure_schema` 换成 Alembic。

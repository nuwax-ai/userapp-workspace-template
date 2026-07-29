# backend-java

Spring Boot 3.5 + MyBatis-Plus 后端模板。监听 `0.0.0.0:$PORT`，连接内置 PostgreSQL，提供 `/health` 与 `items` 全 CRUD（逻辑删除）。

内置：`X-Request-Id` 过滤器 + 访问日志；Rolling 文件日志（`LOG_FILE`，默认 `logs/backend-java.log`）。

## 本地运行

```sh
# 需 JDK 25+ 与可用的 Postgres（默认 localhost:5432 / app:app/app）
export PORT=8080 POSTGRES_USER=app POSTGRES_PASSWORD=app POSTGRES_DB=app
mvn spring-boot:run
```

## 构建产物

```sh
sh scripts/build-standalone.sh   # → artifact.zip（根目录含 app.jar）
```

## 如何加业务模块

1. `model/` 实体  
2. `mapper/` BaseMapper  
3. `service(+impl)/` 业务（抛 `NotFoundException` / `BadRequestException`）  
4. `web/` Controller + DTO  

生产环境可将 `SchemaInitializer` 换成 Flyway / Liquibase。

# backend-java

Spring Boot 3.5 + MyBatis-Plus 后端模板。监听 `0.0.0.0:$PORT`，连接内置 PostgreSQL，提供 `/health` 与 `items` 全 CRUD（逻辑删除）。

内置：`X-Request-Id` 过滤器 + 访问日志；Rolling 文件日志（`LOG_FILE`，默认 `logs/backend-java.log`）。

## 本地运行

```sh
# 需 JDK 25+ 与可用的 Postgres（默认 localhost:5432 / dev:dev/dev，与平台容器 PG 初始凭据一致）
export PORT=8080 POSTGRES_USER=dev POSTGRES_PASSWORD=dev POSTGRES_DB=dev
export JAVA_HOME=/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home   # Homebrew 示例
export PATH="$JAVA_HOME/bin:$PATH"

# macOS 若开启系统代理，JDBC 连 127.0.0.1 可能失败，建议加上下面 JVM 参数
mvn -DskipTests package && cp target/*.jar app.jar
java -Djava.net.useSystemProxies=false -jar app.jar
```

验证：

```sh
curl -s localhost:8080/health
curl -s -X POST localhost:8080/items -H 'Content-Type: application/json' -d '{"name":"demo"}'
```

## 构建产物

```sh
sh scripts/build-standalone.sh   # → artifact.zip（根目录含 app.jar）
```

> 构建脚本默认 `-DskipTests` 跳过测试以加快打包。生产 CI 建议单独跑 `./mvnw test`。

## 如何加业务模块

1. `model/` 实体  
2. `mapper/` BaseMapper  
3. `service(+impl)/` 业务（抛 `NotFoundException` / `BadRequestException`）  
4. `web/` Controller + DTO  

生产环境可将 `SchemaInitializer` 换成 Flyway / Liquibase。

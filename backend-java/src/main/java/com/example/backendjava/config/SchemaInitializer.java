package com.example.backendjava.config;

import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 启动时幂等建表，保证模板开箱即用（无需额外 migrate 脚本）。
 * 业务项目可改为 Flyway / Liquibase。
 */
@Component
public class SchemaInitializer implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SchemaInitializer.class);

    private final JdbcTemplate jdbc;

    public SchemaInitializer(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute(
                """
                CREATE TABLE IF NOT EXISTS items (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    deleted INT NOT NULL DEFAULT 0
                )
                """);
        // 兼容旧表（此前 JPA 示例可能只有 id/name）
        jdbc.execute("ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted INT NOT NULL DEFAULT 0");
        log.info("schema ready: items");
    }
}

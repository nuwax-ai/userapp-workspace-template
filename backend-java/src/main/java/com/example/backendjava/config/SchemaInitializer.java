package com.example.backendjava.config;

import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 启动时幂等建表，保证模板开箱即用（无需额外 migrate 脚本）。
 * 业务项目可改为 Flyway / Liquibase。
 *
 * <p>建表段包在单事务内并先取事务级咨询锁（key=424242，与 go/python/rust 后端、
 * next 迁移共用同一把 key，勿改）：PG 的 CREATE TABLE IF NOT EXISTS 非原子，
 * 并发首启会撞 pg_type 唯一键（SQLSTATE 23505）；咨询锁把建表段全库串行。
 */
@Component
public class SchemaInitializer implements ApplicationRunner {
    /** 跨服务 schema 初始化互斥锁 key（见类注释）。 */
    private static final long SCHEMA_INIT_LOCK_KEY = 424242L;

    private static final Logger log = LoggerFactory.getLogger(SchemaInitializer.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactionTemplate;

    public SchemaInitializer(DataSource dataSource, TransactionTemplate transactionTemplate) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.transactionTemplate = transactionTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        transactionTemplate.executeWithoutResult(status -> {
            // pg_advisory_xact_lock 返回 void（无结果集），用 execute 丢弃结果即可
            jdbc.execute("SELECT pg_advisory_xact_lock(" + SCHEMA_INIT_LOCK_KEY + ")");
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
        });
        log.info("schema ready: items");
    }
}

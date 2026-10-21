use crate::config::Config;
use anyhow::Context;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn connect(cfg: &Config) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(cfg.max_connections)
        .min_connections(cfg.min_connections)
        .acquire_timeout(cfg.acquire_timeout)
        .idle_timeout(cfg.idle_timeout)
        .max_lifetime(cfg.max_lifetime)
        .connect(&cfg.database_url)
        .await
        .context("connect to postgres")?;
    tracing::info!(
        max_connections = cfg.max_connections,
        "postgres pool ready"
    );
    Ok(pool)
}

/// 跨服务 schema 初始化互斥锁 key（与 go/java/python 后端、next 迁移共用，勿改）：
/// PG 的 CREATE TABLE IF NOT EXISTS 非原子——并发首启会撞 pg_type 唯一键
/// （SQLSTATE 23505）；事务级咨询锁把建表段全库串行。
const SCHEMA_INIT_LOCK_KEY: i64 = 424242;

/// 启动幂等建表。生产可改为 sqlx migrate。
pub async fn ensure_schema(pool: &PgPool) -> anyhow::Result<()> {
    let mut tx = pool.begin().await.context("begin schema tx")?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(SCHEMA_INIT_LOCK_KEY)
        .execute(&mut *tx)
        .await
        .context("acquire schema-init advisory lock")?;
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS items (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            deleted INT NOT NULL DEFAULT 0
        )"#,
    )
    .execute(&mut *tx)
    .await
    .context("create items table")?;
    // 兼容旧表（缺 deleted 列的早期形态），与其余四个服务的初始化对齐
    sqlx::query("ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted INT NOT NULL DEFAULT 0")
        .execute(&mut *tx)
        .await
        .context("add deleted column if missing")?;
    tx.commit().await.context("commit schema tx")?;
    tracing::info!("schema ready: items");
    Ok(())
}

use crate::config::Config;
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
        .await?;
    tracing::info!(
        max_connections = cfg.max_connections,
        "postgres pool ready"
    );
    Ok(pool)
}

/// 启动幂等建表。生产可改为 sqlx migrate。
pub async fn ensure_schema(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS items (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            deleted INT NOT NULL DEFAULT 0
        )"#,
    )
    .execute(pool)
    .await?;
    sqlx::query("ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted INT NOT NULL DEFAULT 0")
        .execute(pool)
        .await?;
    tracing::info!("schema ready: items");
    Ok(())
}

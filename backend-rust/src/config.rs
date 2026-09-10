use std::env;
use std::time::Duration;

use anyhow::Context;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: String,
    pub database_url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout: Duration,
    pub idle_timeout: Duration,
    pub max_lifetime: Duration,

    /// 日志目录（滚动文件）；平台注入 APP_LOG_DIR，本地 LOG_DIR 兜底，默认 logs/
    pub log_dir: String,
    /// 日志文件前缀；默认 backend-rust
    pub log_file_prefix: String,
    /// 请求超时
    pub request_timeout: Duration,
    /// RUST_LOG / LOG_LEVEL，默认 info
    pub log_level: String,
}

impl Config {
    /// 从环境变量加载；数值/时长解析失败时 fail-fast（返回 Err），不静默回退默认值。
    pub fn from_env() -> anyhow::Result<Self> {
        let pg_host = env::var("PGHOST").unwrap_or_else(|_| "localhost".into());
        let pg_port = env::var("PGPORT").unwrap_or_else(|_| "5432".into());
        let pg_user =
            urlencoding_component(&env::var("POSTGRES_USER").unwrap_or_else(|_| "dev".into()));
        let pg_pass =
            urlencoding_component(&env::var("POSTGRES_PASSWORD").unwrap_or_else(|_| "dev".into()));
        let pg_db = env::var("POSTGRES_DB").unwrap_or_else(|_| "dev".into());

        Ok(Self {
            port: env::var("PORT").unwrap_or_else(|_| "8080".into()),
            database_url: format!(
                "postgresql://{pg_user}:{pg_pass}@{pg_host}:{pg_port}/{pg_db}?sslmode=disable"
            ),
            max_connections: env_u32("DB_MAX_CONNECTIONS", 10)?,
            min_connections: env_u32("DB_MIN_CONNECTIONS", 1)?,
            acquire_timeout: Duration::from_secs(env_u64("DB_ACQUIRE_TIMEOUT_SECS", 30)?),
            idle_timeout: Duration::from_secs(env_u64("DB_IDLE_TIMEOUT_SECS", 600)?),
            max_lifetime: Duration::from_secs(env_u64("DB_MAX_LIFETIME_SECS", 1800)?),
            log_dir: env::var("APP_LOG_DIR")
                .or_else(|_| env::var("LOG_DIR"))
                .unwrap_or_else(|_| "logs".into()),
            log_file_prefix: env::var("LOG_FILE_PREFIX").unwrap_or_else(|_| "backend-rust".into()),
            request_timeout: Duration::from_secs(env_u64("REQUEST_TIMEOUT_SECS", 30)?),
            log_level: env::var("RUST_LOG")
                .or_else(|_| env::var("LOG_LEVEL"))
                .unwrap_or_else(|_| "info".into()),
        })
    }
}

/// 解析 u32 环境变量；未设置用默认值，设置但非法则 fail-fast。
fn env_u32(key: &str, def: u32) -> anyhow::Result<u32> {
    match env::var(key) {
        Err(_) => Ok(def),
        Ok(v) => v
            .parse()
            .with_context(|| format!("invalid env {key}={v:?}, expected u32 integer")),
    }
}

/// 解析 u64 环境变量；未设置用默认值，设置但非法则 fail-fast。
fn env_u64(key: &str, def: u64) -> anyhow::Result<u64> {
    match env::var(key) {
        Err(_) => Ok(def),
        Ok(v) => v
            .parse()
            .with_context(|| format!("invalid env {key}={v:?}, expected u64 integer")),
    }
}

/// 对 URL userinfo 做百分号编码（密码含 @:#/ 等时必需）。
fn urlencoding_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

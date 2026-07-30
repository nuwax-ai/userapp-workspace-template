//! 日志系统：stdout + 按天滚动文件（tracing-appender）。
//!
//! - 级别：`RUST_LOG` 或 `LOG_LEVEL`（默认 `info`）
//! - 目录：`APP_LOG_DIR`（平台注入；本地 `LOG_DIR` 兜底），默认 `logs/`
//! - 文件：`{LOG_FILE_PREFIX}.log.YYYY-MM-DD`（manifest glob `{prefix}.log*` 匹配活跃与轮转文件）
//!
//! `WorkerGuard` 必须持有到进程结束，否则异步写入可能丢失。
//! tracing-appender 只按天滚动、不清理旧文件，故启动时按 14 天保留清理一次。

use crate::config::Config;
use anyhow::Context;
use std::fs;
use std::time::{Duration, SystemTime};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// 日志保留天数（与平台建议一致）。
const LOG_RETENTION_DAYS: u64 = 14;

pub fn init(cfg: &Config) -> anyhow::Result<WorkerGuard> {
    fs::create_dir_all(&cfg.log_dir)
        .with_context(|| format!("create log dir {}", cfg.log_dir))?;
    cleanup_old_logs(&cfg.log_dir);

    let file_appender = RollingFileAppender::new(
        Rotation::DAILY,
        &cfg.log_dir,
        format!("{}.log", cfg.log_file_prefix),
    );
    let (non_blocking_file, guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::try_new(&cfg.log_level).unwrap_or_else(|_| EnvFilter::new("info"));

    // stdout：人类可读；文件：JSON 便于采集
    let stdout_layer = fmt::layer()
        .with_target(true)
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(std::io::stdout);

    let file_layer = fmt::layer()
        .json()
        .with_target(true)
        .with_span_events(FmtSpan::CLOSE)
        .with_ansi(false)
        .with_writer(non_blocking_file);

    tracing_subscriber::registry()
        .with(filter)
        .with(stdout_layer)
        .with(file_layer)
        .init();

    tracing::info!(
        log_dir = %cfg.log_dir,
        log_level = %cfg.log_level,
        "logging initialized (daily rotation)"
    );

    Ok(guard)
}

/// 尽力清理超过 LOG_RETENTION_DAYS 天的滚动日志（best-effort，失败仅 warn）。
fn cleanup_old_logs(dir: &str) {
    let cutoff = match SystemTime::now().checked_sub(Duration::from_secs(LOG_RETENTION_DAYS * 86400))
    {
        Some(t) => t,
        None => return,
    };
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!(error = %e, dir, "log cleanup: read_dir failed");
            return;
        }
    };
    let mut removed = 0u32;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("backend-rust.log") {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let Ok(mtime) = meta.modified() else {
            continue;
        };
        if mtime < cutoff && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    if removed > 0 {
        tracing::info!(removed, "cleaned up stale rolling logs");
    }
}

//! 日志系统：stdout + 按天滚动文件（tracing-appender）。
//!
//! - 级别：`RUST_LOG` 或 `LOG_LEVEL`（默认 `info`）
//! - 目录：`LOG_DIR`（默认 `logs/`）
//! - 文件：`{LOG_FILE_PREFIX}.YYYY-MM-DD.log`
//!
//! `WorkerGuard` 必须持有到进程结束，否则异步写入可能丢失。

use crate::config::Config;
use std::fs;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init(cfg: &Config) -> anyhow::Result<WorkerGuard> {
    fs::create_dir_all(&cfg.log_dir)?;

    let file_appender = RollingFileAppender::new(
        Rotation::DAILY,
        &cfg.log_dir,
        format!("{}.log", cfg.log_file_prefix),
    );
    let (non_blocking_file, guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::try_new(&cfg.log_level)
        .unwrap_or_else(|_| EnvFilter::new("info"));

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

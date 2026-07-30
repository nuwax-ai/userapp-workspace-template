mod config;
mod db;
mod domain;
mod error;
mod extract;
mod handlers;
mod logging;
mod middleware;
mod repository;
mod routes;
mod service;
mod state;

use anyhow::Context;
use state::AppState;
use std::net::SocketAddr;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = config::Config::from_env()?;

    // WorkerGuard 必须活到进程结束，否则滚动日志缓冲可能丢数据
    let _log_guard = logging::init(&cfg)?;

    let pool = db::connect(&cfg).await?;
    db::ensure_schema(&pool).await?;

    let state = AppState::new(pool);
    let app = routes::build_router(state, &cfg);

    let addr: SocketAddr = format!("0.0.0.0:{}", cfg.port)
        .parse()
        .context("parse bind address")?;
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// 优雅关闭：收到 Ctrl-C 或 SIGTERM 后返回，触发连接 drain（_log_guard 随之 drop 刷盘）。
/// 不使用 expect/unwrap：信号 handler 安装失败只 warn，继续等待另一路信号。
async fn shutdown_signal() {
    let ctrl_c = async {
        if tokio::signal::ctrl_c().await.is_err() {
            tracing::warn!("ctrl_c handler install failed");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => tracing::warn!("SIGTERM handler install failed"),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
    tracing::info!("shutdown signal received, draining connections...");
}

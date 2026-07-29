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

use state::AppState;
use std::net::SocketAddr;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = config::Config::from_env();

    // WorkerGuard 必须活到进程结束，否则滚动日志缓冲可能丢数据
    let _log_guard = logging::init(&cfg)?;

    let pool = db::connect(&cfg).await?;
    db::ensure_schema(&pool).await?;

    let state = AppState::new(pool);
    let app = routes::build_router(state, &cfg);

    let addr: SocketAddr = format!("0.0.0.0:{}", cfg.port).parse()?;
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "listening");
    axum::serve(listener, app).await?;
    Ok(())
}

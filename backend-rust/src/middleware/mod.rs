//! HTTP 中间件栈（tower-http）。
//!
//! 推荐挂载顺序（外 → 内）：
//! SetRequestId → PropagateRequestId → Trace → Timeout → Compression → Handler

use crate::config::Config;
use axum::http::{HeaderName, Request, StatusCode};
use tower_http::compression::CompressionLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultOnFailure, DefaultOnRequest, DefaultOnResponse, TraceLayer};
use tracing::Level;

pub const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

pub fn request_id_layer() -> SetRequestIdLayer<MakeRequestUuid> {
    SetRequestIdLayer::new(REQUEST_ID_HEADER.clone(), MakeRequestUuid)
}

pub fn propagate_request_id_layer() -> PropagateRequestIdLayer {
    PropagateRequestIdLayer::new(REQUEST_ID_HEADER.clone())
}

pub fn trace_layer() -> TraceLayer<
    tower_http::classify::SharedClassifier<tower_http::classify::ServerErrorsAsFailures>,
    impl Fn(&Request<axum::body::Body>) -> tracing::Span + Clone,
> {
    TraceLayer::new_for_http()
        .make_span_with(|req: &Request<_>| {
            let request_id = req
                .headers()
                .get(&REQUEST_ID_HEADER)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("-");
            tracing::info_span!(
                "http",
                method = %req.method(),
                uri = %req.uri(),
                request_id = %request_id,
            )
        })
        .on_request(DefaultOnRequest::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO))
        .on_failure(DefaultOnFailure::new().level(Level::ERROR))
}

pub fn timeout_layer(cfg: &Config) -> TimeoutLayer {
    TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, cfg.request_timeout)
}

pub fn compression_layer() -> CompressionLayer {
    CompressionLayer::new()
}

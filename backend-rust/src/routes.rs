use axum::routing::get;
use axum::Router;

use crate::config::Config;
use crate::handlers::{health, items};
use crate::middleware;
use crate::state::AppState;

pub fn build_router(state: AppState, cfg: &Config) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/items", get(items::list_items).post(items::create_item))
        .route(
            "/items/{id}",
            get(items::get_item)
                .put(items::update_item)
                .delete(items::delete_item),
        )
        .route("/api/items", get(items::list_items).post(items::create_item))
        .route(
            "/api/items/{id}",
            get(items::get_item)
                .put(items::update_item)
                .delete(items::delete_item),
        )
        .with_state(state)
        // 中间件：后添加的更靠外（RequestId 最外层）
        .layer(middleware::compression_layer())
        .layer(middleware::timeout_layer(cfg))
        .layer(middleware::trace_layer())
        .layer(middleware::propagate_request_id_layer())
        .layer(middleware::request_id_layer())
}

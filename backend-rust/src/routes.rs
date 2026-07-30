use axum::routing::get;
use axum::Router;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::config::Config;
use crate::handlers::{health, items};
use crate::middleware;
use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "backend-rust API",
        version = "0.1.0",
        description = "UserApp Rust 后端模板（axum + sqlx）"
    ),
    paths(
        health::health,
        health::ready,
        items::list_items,
        items::create_item,
        items::get_item,
        items::update_item,
        items::delete_item,
    ),
    components(schemas(
        crate::domain::Item,
        crate::domain::ItemCreate,
        crate::domain::ItemUpdate,
        items::DeleteResp,
        health::Health,
        health::Ready,
    )),
)]
pub struct ApiDoc;

pub fn build_router(state: AppState, cfg: &Config) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
        .route("/items", get(items::list_items).post(items::create_item))
        .route(
            "/items/{id}",
            get(items::get_item)
                .put(items::update_item)
                .delete(items::delete_item),
        )
        .merge(SwaggerUi::new("/docs").url(
            "/api-docs/openapi.json",
            ApiDoc::openapi(),
        ))
        .with_state(state)
        // 中间件：后添加的更靠外（RequestId 最外层）
        .layer(middleware::compression_layer())
        .layer(middleware::timeout_layer(cfg))
        .layer(middleware::trace_layer())
        .layer(middleware::propagate_request_id_layer())
        .layer(middleware::request_id_layer())
}

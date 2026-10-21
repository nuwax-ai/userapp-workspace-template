use axum::extract::State;
use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct Health {
    pub status: &'static str,
    pub service: &'static str,
}

/// 存活/启动探针：进程在即 200（廉价，不探依赖）。
#[utoipa::path(
    get,
    path = "/health",
    responses((status = 200, description = "进程存活", body = Health))
)]
pub async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "rust",
    })
}

#[derive(Serialize, ToSchema)]
pub struct Ready {
    pub status: &'static str,
    pub db: &'static str,
}

/// readiness 探针：执行 SELECT 1，覆盖数据库依赖。DB 不可用时返回 503。
#[utoipa::path(
    get,
    path = "/ready",
    responses(
        (status = 200, description = "就绪（DB 可用）", body = Ready),
        (status = 503, description = "未就绪（DB 不可用）")
    )
)]
pub async fn ready(State(state): State<AppState>) -> AppResult<Json<Ready>> {
    sqlx::query("SELECT 1")
        .execute(&state.pool)
        .await
        .map_err(|e| AppError::ServiceUnavailable(format!("db ping failed: {e}")))?;
    Ok(Json(Ready {
        status: "ok",
        db: "connected",
    }))
}

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    NotFound(String),
    Internal(String),
    /// 服务暂不可用（如 readiness 探针发现依赖不可用）。映射 503。
    ServiceUnavailable(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, m.clone()),
            AppError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m.clone()),
            AppError::ServiceUnavailable(m) => (StatusCode::SERVICE_UNAVAILABLE, m.clone()),
        };

        match &self {
            AppError::Internal(m) => tracing::error!(error = %m, "internal error"),
            AppError::ServiceUnavailable(m) => tracing::warn!(error = %m, "service unavailable"),
            AppError::BadRequest(m) => tracing::warn!(error = %m, "bad request"),
            AppError::NotFound(m) => tracing::debug!(error = %m, "not found"),
        }

        (status, Json(ErrorBody { error: msg })).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Internal(format!("db error: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;

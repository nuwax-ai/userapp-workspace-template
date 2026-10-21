use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::extract::{FromRequest, FromRequestParts, Path, Request};
use axum::http::request::Parts;
use axum::Json;
use serde::de::DeserializeOwned;

use crate::error::AppError;

/// JSON 提取器：把框架默认 Rejection 转成统一 `{"error":...}`。
pub struct AppJson<T>(pub T);

impl<S, T> FromRequest<S> for AppJson<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        match Json::<T>::from_request(req, state).await {
            Ok(Json(value)) => Ok(AppJson(value)),
            Err(err) => Err(err.into()),
        }
    }
}

/// 路径参数提取器：非法 id 统一为 `invalid item id`。
pub struct AppPath<T>(pub T);

impl<S, T> FromRequestParts<S> for AppPath<T>
where
    T: DeserializeOwned + Send,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match Path::<T>::from_request_parts(parts, state).await {
            Ok(Path(value)) => Ok(AppPath(value)),
            Err(err) => Err(err.into()),
        }
    }
}

impl From<JsonRejection> for AppError {
    fn from(_: JsonRejection) -> Self {
        AppError::BadRequest("invalid json body".into())
    }
}

impl From<PathRejection> for AppError {
    fn from(_: PathRejection) -> Self {
        AppError::BadRequest("invalid item id".into())
    }
}

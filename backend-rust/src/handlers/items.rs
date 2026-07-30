use axum::extract::State;
use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

use crate::domain::{Item, ItemCreate, ItemUpdate};
use crate::error::AppResult;
use crate::extract::{AppJson, AppPath};
use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct DeleteResp {
    pub deleted: bool,
    pub id: i64,
}

/// 列出全部 item。
#[utoipa::path(
    get,
    path = "/items",
    responses((status = 200, description = "item 列表", body = [Item]))
)]
pub async fn list_items(State(state): State<AppState>) -> AppResult<Json<Vec<Item>>> {
    Ok(Json(state.items.list().await?))
}

/// 新建 item。
#[utoipa::path(
    post,
    path = "/items",
    request_body = ItemCreate,
    responses(
        (status = 200, description = "新建的 item", body = Item),
        (status = 400, description = "name 为空")
    )
)]
pub async fn create_item(
    State(state): State<AppState>,
    AppJson(body): AppJson<ItemCreate>,
) -> AppResult<Json<Item>> {
    Ok(Json(state.items.create(body.name).await?))
}

/// 获取单个 item。
#[utoipa::path(
    get,
    path = "/items/{id}",
    params(("id" = i64, Path, description = "item id")),
    responses(
        (status = 200, description = "item", body = Item),
        (status = 404, description = "不存在")
    )
)]
pub async fn get_item(
    State(state): State<AppState>,
    AppPath(id): AppPath<i64>,
) -> AppResult<Json<Item>> {
    Ok(Json(state.items.get(id).await?))
}

/// 更新 item。
#[utoipa::path(
    put,
    path = "/items/{id}",
    params(("id" = i64, Path, description = "item id")),
    request_body = ItemUpdate,
    responses(
        (status = 200, description = "更新后的 item", body = Item),
        (status = 400, description = "name 为空"),
        (status = 404, description = "不存在")
    )
)]
pub async fn update_item(
    State(state): State<AppState>,
    AppPath(id): AppPath<i64>,
    AppJson(body): AppJson<ItemUpdate>,
) -> AppResult<Json<Item>> {
    Ok(Json(state.items.update(id, body.name).await?))
}

/// 软删除 item。
#[utoipa::path(
    delete,
    path = "/items/{id}",
    params(("id" = i64, Path, description = "item id")),
    responses(
        (status = 200, description = "删除结果", body = DeleteResp),
        (status = 404, description = "不存在")
    )
)]
pub async fn delete_item(
    State(state): State<AppState>,
    AppPath(id): AppPath<i64>,
) -> AppResult<Json<DeleteResp>> {
    state.items.delete(id).await?;
    Ok(Json(DeleteResp { deleted: true, id }))
}

use axum::Json;
use serde::Serialize;

use crate::domain::{Item, ItemCreate, ItemUpdate};
use crate::error::AppResult;
use crate::extract::{AppJson, AppPath};
use crate::state::AppState;
use axum::extract::State;

#[derive(Serialize)]
pub struct DeleteResp {
    pub deleted: bool,
    pub id: i64,
}

pub async fn list_items(State(state): State<AppState>) -> AppResult<Json<Vec<Item>>> {
    Ok(Json(state.items.list().await?))
}

pub async fn create_item(
    State(state): State<AppState>,
    AppJson(body): AppJson<ItemCreate>,
) -> AppResult<Json<Item>> {
    Ok(Json(state.items.create(body.name).await?))
}

pub async fn get_item(
    State(state): State<AppState>,
    AppPath(id): AppPath<i64>,
) -> AppResult<Json<Item>> {
    Ok(Json(state.items.get(id).await?))
}

pub async fn update_item(
    State(state): State<AppState>,
    AppPath(id): AppPath<i64>,
    AppJson(body): AppJson<ItemUpdate>,
) -> AppResult<Json<Item>> {
    Ok(Json(state.items.update(id, body.name).await?))
}

pub async fn delete_item(
    State(state): State<AppState>,
    AppPath(id): AppPath<i64>,
) -> AppResult<Json<DeleteResp>> {
    state.items.delete(id).await?;
    Ok(Json(DeleteResp {
        deleted: true,
        id,
    }))
}

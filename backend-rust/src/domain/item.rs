use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct Item {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ItemCreate {
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ItemUpdate {
    pub name: String,
}

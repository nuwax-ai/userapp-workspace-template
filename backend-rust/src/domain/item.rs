use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Item {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct ItemCreate {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct ItemUpdate {
    pub name: String,
}

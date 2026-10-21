use sqlx::PgPool;

use crate::domain::Item;
use crate::error::{AppError, AppResult};
use crate::repository::ItemRepository;

#[derive(Clone)]
pub struct ItemService {
    db: PgPool,
}

impl ItemService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn list(&self) -> AppResult<Vec<Item>> {
        ItemRepository::new(&self.db).list().await
    }

    pub async fn get(&self, id: i64) -> AppResult<Item> {
        ItemRepository::new(&self.db).get(id).await
    }

    pub async fn create(&self, name: String) -> AppResult<Item> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::BadRequest("name is required".into()));
        }
        let item = ItemRepository::new(&self.db).create(&name).await?;
        tracing::info!(item_id = item.id, "item created");
        Ok(item)
    }

    pub async fn update(&self, id: i64, name: String) -> AppResult<Item> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::BadRequest("name is required".into()));
        }
        let item = ItemRepository::new(&self.db).update(id, &name).await?;
        tracing::info!(item_id = item.id, "item updated");
        Ok(item)
    }

    pub async fn delete(&self, id: i64) -> AppResult<()> {
        ItemRepository::new(&self.db).soft_delete(id).await?;
        tracing::info!(item_id = id, "item soft-deleted");
        Ok(())
    }
}

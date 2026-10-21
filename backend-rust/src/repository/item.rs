use sqlx::PgPool;

use crate::domain::Item;
use crate::error::{AppError, AppResult};

pub struct ItemRepository<'a> {
    db: &'a PgPool,
}

impl<'a> ItemRepository<'a> {
    pub fn new(db: &'a PgPool) -> Self {
        Self { db }
    }

    pub async fn list(&self) -> AppResult<Vec<Item>> {
        let rows = sqlx::query_as::<_, Item>(
            "SELECT id, name FROM items WHERE deleted = 0 ORDER BY id",
        )
        .fetch_all(self.db)
        .await?;
        Ok(rows)
    }

    pub async fn get(&self, id: i64) -> AppResult<Item> {
        let row = sqlx::query_as::<_, Item>(
            "SELECT id, name FROM items WHERE id = $1 AND deleted = 0",
        )
        .bind(id)
        .fetch_optional(self.db)
        .await?;
        row.ok_or_else(|| AppError::NotFound("item not found".into()))
    }

    pub async fn create(&self, name: &str) -> AppResult<Item> {
        let item = sqlx::query_as::<_, Item>(
            "INSERT INTO items(name, deleted) VALUES($1, 0) RETURNING id, name",
        )
        .bind(name)
        .fetch_one(self.db)
        .await?;
        Ok(item)
    }

    pub async fn update(&self, id: i64, name: &str) -> AppResult<Item> {
        let row = sqlx::query_as::<_, Item>(
            "UPDATE items SET name = $1 WHERE id = $2 AND deleted = 0 RETURNING id, name",
        )
        .bind(name)
        .bind(id)
        .fetch_optional(self.db)
        .await?;
        row.ok_or_else(|| AppError::NotFound("item not found".into()))
    }

    pub async fn soft_delete(&self, id: i64) -> AppResult<()> {
        let result = sqlx::query("UPDATE items SET deleted = 1 WHERE id = $1 AND deleted = 0")
            .bind(id)
            .execute(self.db)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("item not found".into()));
        }
        Ok(())
    }
}

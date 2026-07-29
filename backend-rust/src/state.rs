use sqlx::PgPool;

use crate::service::ItemService;

/// 应用共享状态（注入到 handler）。
#[derive(Clone)]
pub struct AppState {
    pub items: ItemService,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            items: ItemService::new(db),
        }
    }
}

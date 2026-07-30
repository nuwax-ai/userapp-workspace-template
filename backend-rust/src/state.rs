use sqlx::PgPool;

use crate::service::ItemService;

/// 应用共享状态（注入到 handler）。
#[derive(Clone)]
pub struct AppState {
    pub items: ItemService,
    /// 原始连接池：供 readiness 探针等基础设施直接探活 DB。
    pub pool: PgPool,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        // PgPool 内部是 Arc，clone 廉价。
        Self {
            items: ItemService::new(db.clone()),
            pool: db,
        }
    }
}

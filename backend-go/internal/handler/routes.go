package handler

import (
	"github.com/gin-gonic/gin"
)

// RegisterRoutes 挂载健康检查（/health 存活、/ready 就绪探 DB）与 items CRUD。
// proxy 已 strip_prefix，上游只见 /items，不再注册 /api/items 兜底别名。
func RegisterRoutes(r *gin.Engine, healthH *HealthHandler, itemH *ItemHandler) {
	r.GET("/health", healthH.Health)
	r.GET("/ready", healthH.Ready)

	items := r.Group("/items")
	{
		items.GET("", itemH.List)
		items.POST("", itemH.Create)
		items.GET("/:id", itemH.Get)
		items.PUT("/:id", itemH.Update)
		items.DELETE("/:id", itemH.Delete)
	}
}

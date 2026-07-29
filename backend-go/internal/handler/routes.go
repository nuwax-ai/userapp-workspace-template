package handler

import (
	"github.com/gin-gonic/gin"
)

// RegisterRoutes 挂载健康检查与 items CRUD（含 /api/items 别名）。
func RegisterRoutes(r *gin.Engine, healthH *HealthHandler, itemH *ItemHandler) {
	api := r.Group("/")
	{
		api.GET("/health", healthH.Health)

		items := api.Group("/items")
		{
			items.GET("", itemH.List)
			items.POST("", itemH.Create)
			items.GET("/:id", itemH.Get)
			items.PUT("/:id", itemH.Update)
			items.DELETE("/:id", itemH.Delete)
		}

		// alias：strip_prefix 未生效时的兜底
		alias := api.Group("/api/items")
		{
			alias.GET("", itemH.List)
			alias.POST("", itemH.Create)
			alias.GET("/:id", itemH.Get)
			alias.PUT("/:id", itemH.Update)
			alias.DELETE("/:id", itemH.Delete)
		}
	}
}

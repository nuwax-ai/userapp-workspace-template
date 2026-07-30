package handler

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type HealthHandler struct {
	db *sql.DB
}

func NewHealthHandler(db *sql.DB) *HealthHandler { return &HealthHandler{db: db} }

// Health 存活/启动探针：进程在即 200（廉价，不探依赖）。
func (h *HealthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "go"})
}

// Ready readiness 探针：执行 SELECT 1，覆盖数据库依赖。DB 不可用时返回 503。
func (h *HealthHandler) Ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	var one int
	if err := h.db.QueryRowContext(ctx, "SELECT 1").Scan(&one); err != nil {
		slog.Error("readiness db ping failed", "err", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "db": "unreachable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "db": "connected"})
}

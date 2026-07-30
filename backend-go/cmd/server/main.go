package main

import (
	"log/slog"
	"net"
	"os"

	"backend-go/internal/config"
	"backend-go/internal/db"
	"backend-go/internal/handler"
	"backend-go/internal/logging"
	"backend-go/internal/middleware"
	"backend-go/internal/repository"
	"backend-go/internal/service"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}

	if _, err := logging.Setup(); err != nil {
		slog.Error("logging setup failed", "err", err)
		os.Exit(1)
	}

	gdb, err := db.Open(cfg)
	if err != nil {
		slog.Error("open db failed", "err", err)
		os.Exit(1)
	}
	if err := db.EnsureSchema(gdb); err != nil {
		slog.Error("ensure schema failed", "err", err)
		os.Exit(1)
	}

	itemRepo := repository.NewItemRepository(gdb)
	itemSvc := service.NewItemService(itemRepo)
	itemH := handler.NewItemHandler(itemSvc)

	// readiness 探针用裸 *sql.DB 做 SELECT 1，不依赖 gorm。
	sqlDB, err := gdb.DB()
	if err != nil {
		slog.Error("get sql.DB failed", "err", err)
		os.Exit(1)
	}
	healthH := handler.NewHealthHandler(sqlDB)

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(
		middleware.Recover(),
		middleware.RequestID(),
		middleware.AccessLog(),
	)
	handler.RegisterRoutes(r, healthH, itemH)

	addr := net.JoinHostPort("0.0.0.0", cfg.Port)
	slog.Info("listening", "addr", addr)
	if err := r.Run(addr); err != nil {
		slog.Error("listen failed", "err", err)
		os.Exit(1)
	}
}

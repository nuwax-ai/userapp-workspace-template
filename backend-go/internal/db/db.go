package db

import (
	"fmt"

	"backend-go/internal/config"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(cfg config.Config) (*gorm.DB, error) {
	gdb, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("gorm open: %w", err)
	}

	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, fmt.Errorf("sql db: %w", err)
	}
	sqlDB.SetMaxOpenConns(cfg.DBMaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.DBMaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.DBConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(cfg.DBConnMaxIdleTime)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return gdb, nil
}

// EnsureSchema 启动幂等建表（模板开箱即用）。
// 生产环境可改为 golang-migrate / goose 等正式迁移工具。
func EnsureSchema(gdb *gorm.DB) error {
	return gdb.Exec(`
		CREATE TABLE IF NOT EXISTS items (
			id BIGSERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			deleted INT NOT NULL DEFAULT 0
		);
		ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted INT NOT NULL DEFAULT 0;
	`).Error
}

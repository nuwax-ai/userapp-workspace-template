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

// schemaInitLockKey 是 userapp 模板跨服务 schema 初始化互斥锁（与 java/python/
// rust 后端、next 迁移共用同一把 key，勿改）。PG 的 CREATE TABLE IF NOT EXISTS
// 非原子——并发首启时存在性检查与系统目录写入之间有间隙，会撞 pg_type 唯一键
// （SQLSTATE 23505）；事务级咨询锁把建表段全库串行，后来者的检查变确定性。
const schemaInitLockKey = 424242

// EnsureSchema 启动幂等建表（模板开箱即用）。
// 生产环境可改为 golang-migrate / goose 等正式迁移工具。
func EnsureSchema(gdb *gorm.DB) error {
	return gdb.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", schemaInitLockKey).Error; err != nil {
			return err
		}
		if err := tx.Exec(`
			CREATE TABLE IF NOT EXISTS items (
				id BIGSERIAL PRIMARY KEY,
				name TEXT NOT NULL,
				deleted INT NOT NULL DEFAULT 0
			)
		`).Error; err != nil {
			return err
		}
		return tx.Exec(`ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted INT NOT NULL DEFAULT 0`).Error
	})
}

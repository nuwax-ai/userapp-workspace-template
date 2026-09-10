package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port string

	PGHost string
	PGPort string
	PGUser string
	PGPass string
	PGDB   string

	DBMaxOpenConns    int
	DBMaxIdleConns    int
	DBConnMaxLifetime time.Duration
	DBConnMaxIdleTime time.Duration
}

// Load 从环境变量加载配置；数值/时长解析失败时 fail-fast（返回错误），不静默回退默认值。
func Load() (Config, error) {
	cfg := Config{
		Port: getenv("PORT", "8080"),

		PGHost: getenv("PGHOST", "localhost"),
		PGPort: getenv("PGPORT", "5432"),
		PGUser: getenv("POSTGRES_USER", "dev"),
		PGPass: getenv("POSTGRES_PASSWORD", "dev"),
		PGDB:   getenv("POSTGRES_DB", "dev"),
	}

	var err error
	if cfg.DBMaxOpenConns, err = getenvInt("DB_MAX_OPEN_CONNS", 10); err != nil {
		return Config{}, err
	}
	if cfg.DBMaxIdleConns, err = getenvInt("DB_MAX_IDLE_CONNS", 5); err != nil {
		return Config{}, err
	}
	if cfg.DBConnMaxLifetime, err = getenvDuration("DB_CONN_MAX_LIFETIME", 30*time.Minute); err != nil {
		return Config{}, err
	}
	if cfg.DBConnMaxIdleTime, err = getenvDuration("DB_CONN_MAX_IDLE_TIME", 10*time.Minute); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) DSN() string {
	return "host=" + c.PGHost +
		" user=" + c.PGUser +
		" password=" + c.PGPass +
		" dbname=" + c.PGDB +
		" port=" + c.PGPort +
		" sslmode=disable TimeZone=UTC"
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("invalid %s=%q: %w", key, v, err)
	}
	return n, nil
}

func getenvDuration(key string, def time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("invalid %s=%q: %w", key, v, err)
	}
	return d, nil
}

package config

import (
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

func Load() Config {
	return Config{
		Port: getenv("PORT", "8080"),

		PGHost: getenv("PGHOST", "localhost"),
		PGPort: getenv("PGPORT", "5432"),
		PGUser: getenv("POSTGRES_USER", "app"),
		PGPass: getenv("POSTGRES_PASSWORD", "app"),
		PGDB:   getenv("POSTGRES_DB", "app"),

		DBMaxOpenConns:    getenvInt("DB_MAX_OPEN_CONNS", 10),
		DBMaxIdleConns:    getenvInt("DB_MAX_IDLE_CONNS", 5),
		DBConnMaxLifetime: getenvDuration("DB_CONN_MAX_LIFETIME", 30*time.Minute),
		DBConnMaxIdleTime: getenvDuration("DB_CONN_MAX_IDLE_TIME", 10*time.Minute),
	}
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

func getenvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getenvDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

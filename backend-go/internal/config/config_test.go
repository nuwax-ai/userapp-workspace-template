package config

import (
	"github.com/jackc/pgx/v5/pgconn"
	"testing"
)

func TestDSNPreservesCredentials(t *testing.T) {
	for _, host := range []string{"::1", "localhost", "/var/run/postgresql"} {
		for _, password := range []string{"ordinary", "spaces and 'quotes'", "a+b@:/?#%\\"} {
			cfg := Config{PGHost: host, PGPort: "5432", PGUser: "app user", PGPass: password, PGDB: "app/db"}
			parsed, err := pgconn.ParseConfig(cfg.DSN())
			if err != nil {
				t.Fatalf("parse DSN: %v", err)
			}
			if parsed.Password != password || parsed.User != cfg.PGUser || parsed.Database != cfg.PGDB || parsed.Host != cfg.PGHost {
				t.Fatal("DSN changed connection parameters")
			}
		}
	}
}

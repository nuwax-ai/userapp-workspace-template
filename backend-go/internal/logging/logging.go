package logging

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"

	"gopkg.in/natefinch/lumberjack.v2"
)

// Setup 初始化 slog：stdout + 按大小滚动文件。
// LOG_DIR 默认 logs，LOG_FILE 默认 backend-go.log。
func Setup() (*slog.Logger, error) {
	dir := getenv("APP_LOG_DIR", getenv("LOG_DIR", "logs"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	fileName := getenv("LOG_FILE", "backend-go.log")

	roller := &lumberjack.Logger{
		Filename:   filepath.Join(dir, fileName),
		MaxSize:    50, // MB
		MaxBackups: 14,
		MaxAge:     14, // days
		// 不压缩：轮转产物须保持 .log 明文——manifest glob "backend-go*.log*"
		// 会匹配轮转文件，压缩出的 .gz 会以二进制乱码进日志采集查询面。
		Compress: false,
	}

	w := io.MultiWriter(os.Stdout, roller)
	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo})
	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

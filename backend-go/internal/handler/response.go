package handler

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

func WriteError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"error": msg})
}

// serverError 记录真实错误（含 request_id）并返回通用 500，
// 既避免把内部细节泄漏给客户端，又保证 500 能在日志里定位原因。
func serverError(c *gin.Context, msg string, err error) {
	args := []any{"err", err}
	if rid, ok := c.Get("request_id"); ok {
		args = append(args, "request_id", rid)
	}
	slog.Error(msg, args...)
	WriteError(c, http.StatusInternalServerError, msg)
}

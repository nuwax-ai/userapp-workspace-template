package handler

import (
	"github.com/gin-gonic/gin"
)

func WriteError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"error": msg})
}

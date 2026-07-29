package handler

import (
	"net/http"

	"backend-go/internal/model"
	"backend-go/internal/repository"
	"backend-go/internal/service"
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
)

type ItemHandler struct {
	svc *service.ItemService
}

func NewItemHandler(svc *service.ItemService) *ItemHandler {
	return &ItemHandler{svc: svc}
}

type itemBody struct {
	Name string `json:"name"`
}

func (h *ItemHandler) List(c *gin.Context) {
	items, err := h.svc.List()
	if err != nil {
		WriteError(c, http.StatusInternalServerError, "db query failed")
		return
	}
	if items == nil {
		items = []model.Item{}
	}
	c.JSON(http.StatusOK, items)
}

func (h *ItemHandler) Create(c *gin.Context) {
	var body itemBody
	if err := c.ShouldBindJSON(&body); err != nil {
		WriteError(c, http.StatusBadRequest, "invalid json body")
		return
	}
	item, err := h.svc.Create(body.Name)
	if errors.Is(err, service.ErrInvalidName) {
		WriteError(c, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		WriteError(c, http.StatusInternalServerError, "db insert failed")
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *ItemHandler) Get(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := h.svc.Get(id)
	if errors.Is(err, repository.ErrNotFound) {
		WriteError(c, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		WriteError(c, http.StatusInternalServerError, "db query failed")
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *ItemHandler) Update(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var body itemBody
	if err := c.ShouldBindJSON(&body); err != nil {
		WriteError(c, http.StatusBadRequest, "invalid json body")
		return
	}
	item, err := h.svc.Update(id, body.Name)
	if errors.Is(err, service.ErrInvalidName) {
		WriteError(c, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, repository.ErrNotFound) {
		WriteError(c, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		WriteError(c, http.StatusInternalServerError, "db update failed")
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *ItemHandler) Delete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	err := h.svc.Delete(id)
	if errors.Is(err, repository.ErrNotFound) {
		WriteError(c, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		WriteError(c, http.StatusInternalServerError, "db delete failed")
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true, "id": id})
}

func parseID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		WriteError(c, http.StatusBadRequest, "invalid item id")
		return 0, false
	}
	return id, true
}

package service

import (
	"strings"

	"backend-go/internal/model"
	"backend-go/internal/repository"
)

type ItemService struct {
	repo *repository.ItemRepository
}

func NewItemService(repo *repository.ItemRepository) *ItemService {
	return &ItemService{repo: repo}
}

func (s *ItemService) List() ([]model.Item, error) {
	return s.repo.List()
}

func (s *ItemService) Get(id int64) (*model.Item, error) {
	return s.repo.GetByID(id)
}

func (s *ItemService) Create(name string) (*model.Item, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.Create(name)
}

func (s *ItemService) Update(id int64, name string) (*model.Item, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	return s.repo.Update(id, name)
}

func (s *ItemService) Delete(id int64) error {
	return s.repo.SoftDelete(id)
}

var ErrInvalidName = errInvalidName{}

type errInvalidName struct{}

func (errInvalidName) Error() string { return "name is required" }

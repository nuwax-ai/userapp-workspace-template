package repository

import (
	"errors"

	"backend-go/internal/model"

	"gorm.io/gorm"
)

var ErrNotFound = errors.New("item not found")

type ItemRepository struct {
	db *gorm.DB
}

func NewItemRepository(db *gorm.DB) *ItemRepository {
	return &ItemRepository{db: db}
}

func (r *ItemRepository) List() ([]model.Item, error) {
	var items []model.Item
	err := r.db.Where("deleted = 0").Order("id ASC").Find(&items).Error
	return items, err
}

func (r *ItemRepository) GetByID(id int64) (*model.Item, error) {
	var item model.Item
	err := r.db.Where("id = ? AND deleted = 0", id).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *ItemRepository) Create(name string) (*model.Item, error) {
	item := &model.Item{Name: name, Deleted: 0}
	if err := r.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (r *ItemRepository) Update(id int64, name string) (*model.Item, error) {
	item, err := r.GetByID(id)
	if err != nil {
		return nil, err
	}
	item.Name = name
	if err := r.db.Model(item).Update("name", name).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (r *ItemRepository) SoftDelete(id int64) error {
	res := r.db.Model(&model.Item{}).Where("id = ? AND deleted = 0", id).Update("deleted", 1)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

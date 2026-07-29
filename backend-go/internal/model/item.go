package model

type Item struct {
	ID      int64  `json:"id" gorm:"column:id;primaryKey;autoIncrement"`
	Name    string `json:"name" gorm:"column:name;not null"`
	Deleted int    `json:"-" gorm:"column:deleted;not null;default:0"`
}

func (Item) TableName() string { return "items" }

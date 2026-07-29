from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)


class ItemUpdate(BaseModel):
    name: str = Field(min_length=1)


class ItemOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}

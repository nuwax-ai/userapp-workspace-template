from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.schemas.item import ItemCreate, ItemOut, ItemUpdate
from app.services.item import ItemService

router = APIRouter(tags=["items"])


def get_service(session: AsyncSession = Depends(get_session)) -> ItemService:
    return ItemService(session)


@router.get("/items", response_model=list[ItemOut])
@router.get("/api/items", response_model=list[ItemOut], include_in_schema=False)
async def list_items(svc: ItemService = Depends(get_service)) -> list[ItemOut]:
    items = await svc.list()
    return [ItemOut.model_validate(i) for i in items]


@router.post("/items", response_model=ItemOut)
@router.post("/api/items", response_model=ItemOut, include_in_schema=False)
async def create_item(
    body: ItemCreate, svc: ItemService = Depends(get_service)
) -> ItemOut:
    item = await svc.create(body.name)
    return ItemOut.model_validate(item)


@router.get("/items/{item_id}", response_model=ItemOut)
@router.get("/api/items/{item_id}", response_model=ItemOut, include_in_schema=False)
async def get_item(item_id: int, svc: ItemService = Depends(get_service)) -> ItemOut:
    item = await svc.get(item_id)
    return ItemOut.model_validate(item)


@router.put("/items/{item_id}", response_model=ItemOut)
@router.put("/api/items/{item_id}", response_model=ItemOut, include_in_schema=False)
async def update_item(
    item_id: int, body: ItemUpdate, svc: ItemService = Depends(get_service)
) -> ItemOut:
    item = await svc.update(item_id, body.name)
    return ItemOut.model_validate(item)


@router.delete("/items/{item_id}")
@router.delete("/api/items/{item_id}", include_in_schema=False)
async def delete_item(item_id: int, svc: ItemService = Depends(get_service)) -> dict:
    await svc.delete(item_id)
    return {"deleted": True, "id": item_id}

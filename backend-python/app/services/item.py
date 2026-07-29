from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BadRequestError, NotFoundError
from app.models.item import Item
from app.repositories.item import ItemRepository


class ItemService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = ItemRepository(session)

    async def list(self) -> list[Item]:
        return await self.repo.list()

    async def get(self, item_id: int) -> Item:
        item = await self.repo.get(item_id)
        if item is None:
            raise NotFoundError("item not found")
        return item

    async def create(self, name: str) -> Item:
        name = name.strip()
        if not name:
            raise BadRequestError("name is required")
        return await self.repo.create(name)

    async def update(self, item_id: int, name: str) -> Item:
        name = name.strip()
        if not name:
            raise BadRequestError("name is required")
        item = await self.get(item_id)
        return await self.repo.update(item, name)

    async def delete(self, item_id: int) -> None:
        ok = await self.repo.soft_delete(item_id)
        if not ok:
            raise NotFoundError("item not found")

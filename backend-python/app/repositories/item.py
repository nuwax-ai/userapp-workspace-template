from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import Item


class ItemRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self) -> list[Item]:
        result = await self.session.execute(
            select(Item).where(Item.deleted == 0).order_by(Item.id.asc())
        )
        return list(result.scalars().all())

    async def get(self, item_id: int) -> Item | None:
        result = await self.session.execute(
            select(Item).where(Item.id == item_id, Item.deleted == 0)
        )
        return result.scalar_one_or_none()

    async def create(self, name: str) -> Item:
        item = Item(name=name, deleted=0)
        self.session.add(item)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def update(self, item: Item, name: str) -> Item:
        item.name = name
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def soft_delete(self, item_id: int) -> bool:
        result = await self.session.execute(
            update(Item)
            .where(Item.id == item_id, Item.deleted == 0)
            .values(deleted=1)
        )
        await self.session.commit()
        return result.rowcount > 0

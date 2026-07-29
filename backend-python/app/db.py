from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings

engine = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None


def init_engine(settings: Settings) -> None:
    global engine, SessionLocal
    engine = create_async_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_recycle=settings.db_pool_recycle,
        pool_pre_ping=True,
    )
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def ensure_schema() -> None:
    """启动幂等建表。生产可改为 Alembic。"""
    assert engine is not None
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS items (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    deleted INT NOT NULL DEFAULT 0
                )
                """
            )
        )
        await conn.execute(
            text("ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted INT NOT NULL DEFAULT 0")
        )


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    assert SessionLocal is not None
    async with SessionLocal() as session:
        yield session


async def dispose_engine() -> None:
    global engine, SessionLocal
    if engine is not None:
        await engine.dispose()
    engine = None
    SessionLocal = None

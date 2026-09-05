import asyncio
import logging
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings

engine = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None

# 跨服务 schema 初始化互斥锁 key（与 go/java/rust 后端、next 迁移共用，勿改）：
# PG 的 CREATE TABLE IF NOT EXISTS 非原子，并发首启会撞 pg_type 唯一键
# （SQLSTATE 23505）；事务级咨询锁把建表段全库串行。
SCHEMA_INIT_LOCK_KEY = 424242

# ensure_schema 单次尝试限时与重试次数（动机见 ensure_schema docstring）。
_SCHEMA_ATTEMPT_TIMEOUT = 30
_SCHEMA_ATTEMPTS = 3


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
    """启动幂等建表（事务级咨询锁串行化并发首启，生产可改为 Alembic）。

    带超时与重试：SQLAlchemy async + uvloop 在多服务并发启动的突发负载下
    偶发"连接协程唤醒丢失"（await 永不完成、无异常——首启建表即卡死）。
    单次尝试限时，超时则 dispose 连接池（丢弃可能半开/挂起的连接）后重试，
    把"永远挂起"收敛为有限次自恢复。
    """
    if engine is None:
        raise RuntimeError("engine not initialized; call init_engine() first")

    last_error: BaseException | None = None
    for attempt in range(1, _SCHEMA_ATTEMPTS + 1):
        try:
            async with asyncio.timeout(_SCHEMA_ATTEMPT_TIMEOUT):
                await _ensure_schema_once()
            return
        except (TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < _SCHEMA_ATTEMPTS:
                logging.getLogger(__name__).warning(
                    "ensure_schema attempt %d failed (%r), disposing pool and retrying",
                    attempt,
                    exc,
                )
                await engine.dispose()
    raise RuntimeError(f"ensure schema failed after {_SCHEMA_ATTEMPTS} attempts") from last_error


async def _ensure_schema_once() -> None:
    assert engine is not None  # 调用方已检查
    async with engine.begin() as conn:
        await conn.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": SCHEMA_INIT_LOCK_KEY}
        )
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
    if SessionLocal is None:
        raise RuntimeError("SessionLocal not initialized; call init_engine() first")
    async with SessionLocal() as session:
        yield session


async def dispose_engine() -> None:
    global engine, SessionLocal
    if engine is not None:
        await engine.dispose()
    engine = None
    SessionLocal = None

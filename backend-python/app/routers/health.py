from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app import db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "python"}


@router.get("/ready")
async def ready() -> dict[str, str]:
    """readiness 探针：执行 SELECT 1，覆盖数据库依赖。DB 不可用时返回 503。"""
    if db.engine is None:
        raise HTTPException(status_code=503, detail="engine not initialized")
    try:
        async with db.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:  # noqa: BLE001 - 探针需把任意 DB 异常统一转成 503
        raise HTTPException(status_code=503, detail=f"db unreachable: {e}") from e
    return {"status": "ok", "db": "connected"}

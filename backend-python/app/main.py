import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.db import dispose_engine, ensure_schema, init_engine
from app.errors import register_exception_handlers
from app.logging_setup import setup_logging
from app.middleware import RequestContextMiddleware
from app.routers import health, items


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    settings = get_settings()
    init_engine(settings)
    await ensure_schema()
    logging.getLogger(__name__).info("application startup complete")
    yield
    await dispose_engine()
    logging.getLogger(__name__).info("application shutdown complete")


app = FastAPI(title="backend-python", lifespan=lifespan)
app.add_middleware(RequestContextMiddleware)
register_exception_handlers(app)

app.include_router(health.router)
app.include_router(items.router)

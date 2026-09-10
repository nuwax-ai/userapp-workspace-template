from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    port: int = 8080

    pghost: str = "localhost"
    pgport: int = 5432
    postgres_user: str = "app"
    postgres_password: str = "app"
    postgres_db: str = "app"

    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800

    @property
    def database_url(self) -> str:
        user = quote_plus(self.postgres_user)
        password = quote_plus(self.postgres_password)
        return (
            f"postgresql+asyncpg://{user}:{password}"
            f"@{self.pghost}:{self.pgport}/{self.postgres_db}"
        )


def get_settings() -> Settings:
    # 同时兼容 PORT / PGHOST 等大写环境变量
    import os

    return Settings(
        port=int(os.environ.get("PORT", "8080")),
        pghost=os.environ.get("PGHOST", "localhost"),
        pgport=int(os.environ.get("PGPORT", "5432")),
        postgres_user=os.environ.get("POSTGRES_USER", "dev"),
        postgres_password=os.environ.get("POSTGRES_PASSWORD", "dev"),
        postgres_db=os.environ.get("POSTGRES_DB", "dev"),
        db_pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
        db_max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "5")),
        db_pool_timeout=int(os.environ.get("DB_POOL_TIMEOUT", "30")),
        db_pool_recycle=int(os.environ.get("DB_POOL_RECYCLE", "1800")),
    )

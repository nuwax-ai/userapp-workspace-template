import os

from sqlalchemy.engine import URL

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
        return URL.create(
            "postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.pghost,
            port=int(self.pgport),
            database=self.postgres_db,
        ).render_as_string(hide_password=False)



def _env_or_default(key: str, default: str) -> str:
    """凭据类缺省回退打 WARN 保持可观测：缺省是平台初始账号 dev/dev，
    用户改过 PG 密码后静默回落会把排障引向模糊的「密码错误」。"""
    value = os.environ.get(key)
    if value is None:
        print(f"WARN: {key} not set, using platform default '{default}'", flush=True)
        return default
    return value


def get_settings() -> Settings:
    # 同时兼容 PORT / PGHOST 等大写环境变量
    return Settings(
        port=int(os.environ.get("PORT", "8080")),
        pghost=os.environ.get("PGHOST", "localhost"),
        pgport=int(os.environ.get("PGPORT", "5432")),
        postgres_user=_env_or_default("POSTGRES_USER", "dev"),
        postgres_password=_env_or_default("POSTGRES_PASSWORD", "dev"),
        postgres_db=_env_or_default("POSTGRES_DB", "dev"),
        db_pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
        db_max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "5")),
        db_pool_timeout=int(os.environ.get("DB_POOL_TIMEOUT", "30")),
        db_pool_recycle=int(os.environ.get("DB_POOL_RECYCLE", "1800")),
    )

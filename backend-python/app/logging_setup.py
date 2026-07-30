import logging
import os
from logging.handlers import TimedRotatingFileHandler


def setup_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_dir = os.environ.get("APP_LOG_DIR", os.environ.get("LOG_DIR", "logs"))
    os.makedirs(log_dir, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(level)
    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if not any(
        isinstance(h, logging.StreamHandler)
        and not isinstance(h, TimedRotatingFileHandler)
        for h in root.handlers
    ):
        sh = logging.StreamHandler()
        sh.setFormatter(fmt)
        root.addHandler(sh)

    file_path = os.path.join(log_dir, "backend-python.log")
    if not any(isinstance(h, TimedRotatingFileHandler) for h in root.handlers):
        fh = TimedRotatingFileHandler(
            file_path, when="midnight", interval=1, backupCount=14, encoding="utf-8"
        )
        fh.suffix = "%Y-%m-%d"
        fh.setFormatter(fmt)
        root.addHandler(fh)

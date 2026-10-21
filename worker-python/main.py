"""Foreground worker; explicit process startup contract requires app-cli >= 0.3.9."""
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import signal
import threading


def main():
    stopping = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda _signum, _frame: stopping.set())

    log_dir = Path(os.environ.get("APP_LOG_DIR", "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    service_id = os.environ.get("APP_SERVICE_ID", "worker-python")
    handler = RotatingFileHandler(log_dir / f"{service_id}.log", maxBytes=10 * 1024 * 1024, backupCount=3)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.StreamHandler(), handler])
    try:
        # Initialize real dependencies here; propagate failures instead of declaring fake health.
        logging.info("worker initialized")
        while not stopping.wait(1):
            # Replace with bounded/cancellable task processing. Never daemonize the root.
            pass
        logging.info("worker stopped")
    finally:
        logging.shutdown()


if __name__ == "__main__":
    main()

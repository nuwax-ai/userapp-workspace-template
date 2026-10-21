"""薄入口：兼容 [run].command = ["python3", "main.py"]。"""
import os
import sys

# 构建产物把第三方包装进 deps/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "deps"))

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
import uvicorn  # noqa: E402

if __name__ == "__main__":
    settings = get_settings()
    print(f"[python] :{settings.port}", file=sys.stderr)
    uvicorn.run(app, host="0.0.0.0", port=settings.port)

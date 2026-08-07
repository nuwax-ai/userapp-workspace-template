"""
回归守卫:禁止 `from app.db import engine` / `from app.db import SessionLocal`。

这俩是 app.db 的可变全局变量(init_engine/dispose_engine 会重新赋值)。
`from app.db import engine` 会在 import 时绑定当时的值(None 快照),
即使后续 init_engine 赋值了 app.db.engine,importer 里的局部名仍指 None
→ /ready 永久 503 "engine not initialized"。

正确写法:`from app import db` 后用 `db.engine`(属性访问,运行时取最新值)。

历史 bug:health.py 曾踩此坑(commit be76895 修复)。本测试防回归。
"""
import ast
import sys
from pathlib import Path

FORBIDDEN_NAMES = {"engine", "SessionLocal"}
APP_DIR = Path(__file__).resolve().parent.parent / "app"


def _check_file(path: Path):
    """返回该文件中所有违规 import 的 (line, code) 列表。"""
    violations = []
    tree = ast.parse(path.read_text(), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "app.db":
            for alias in node.names:
                if alias.name in FORBIDDEN_NAMES:
                    violations.append((node.lineno, f"from app.db import {alias.name}"))
    return violations


def main():
    all_violations = []
    for py in sorted(APP_DIR.rglob("*.py")):
        all_violations.extend((py, *v) for v in _check_file(py))
    if all_violations:
        for py, line, code in all_violations:
            print(f"  ❌ {py}:{line}  {code}")
        print(f"\n共 {len(all_violations)} 处违规:直接 import app.db 的可变全局,"
              f"会绑定 None 快照导致 /ready 503。改用 `from app import db` + `db.engine`。")
        sys.exit(1)
    print("✅ 无 from app.db import engine/SessionLocal(可变全局 import 陷阱)")


if __name__ == "__main__":
    main()

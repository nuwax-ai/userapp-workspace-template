"""Build a standalone artifact; keep dependency caches outside the artifact."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import sysconfig
import tempfile
import zipfile
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parent.parent


def reusable_lock(text: str) -> bool:
    # The template uses exact wheel pins. Includes, local/editable dependencies,
    # environment substitution and ranges have inputs outside this lock file;
    # run pip normally for those instead of falsely reusing an old deps tree.
    if os.environ.get("PIP_CONSTRAINT") or os.environ.get("PIP_REQUIREMENT"):
        return False
    return all(re.fullmatch(r"[A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.-]+\])?==[^\s*;$]+(?:\s*;[^$]+)?", line)
               for raw in text.splitlines() if (line := raw.split("#", 1)[0].strip()))


def fingerprint(root: Path) -> str:
    # Do not persist index credentials. Hash the install inputs and the wheel ABI,
    # rather than trusting only the Python version printed in requirements.lock.
    inputs = {
        "lock": (root / "requirements.lock").read_text(),
        "python": sys.version,
        "executable": sys.executable,
        "implementation": sys.implementation.name,
        "abi": sysconfig.get_config_var("SOABI"),
        "platform": sysconfig.get_platform(),
        "machine": platform.machine(),
        "libc": platform.libc_ver(),
        "pip": {k: v for k, v in os.environ.items()
                if k.startswith("PIP_") and k not in {"PIP_NO_CACHE_DIR", "PIP_CACHE_DIR", "PIP_DEFAULT_TIMEOUT", "PIP_DISABLE_PIP_VERSION_CHECK"}},
    }
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()


def inventory(directory: Path) -> dict[str, int]:
    return {str(p.relative_to(directory)): p.stat().st_size
            for p in sorted(directory.rglob("*")) if p.is_file()
            and "__pycache__" not in p.parts and p.suffix != ".pyc"}


@contextmanager
def build_lock(root: Path):
    # A real OS lock releases on crash; a stale lock file never blocks a build.
    with (root / ".deps-build.lock").open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            handle.seek(0)
            if not handle.read(1):
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def install_dependencies(root: Path) -> None:
    stamp = root / ".deps-stamp"
    deps = root / "deps"
    expected = fingerprint(root)
    try:
        saved = json.loads(stamp.read_text())
    except (FileNotFoundError, ValueError):
        saved = {}
    if not isinstance(saved, dict):
        saved = {}
    if (reusable_lock((root / "requirements.lock").read_text())
            and saved.get("fingerprint") == expected and deps.is_dir()
            and saved.get("files") == inventory(deps)):
        print("Dependencies unchanged; reusing deps/ (no pip request)", flush=True)
        return

    env = os.environ.copy()
    # pip treats both '0' and '1' as --no-cache-dir. Unset, do not set to zero.
    env.pop("PIP_NO_CACHE_DIR", None)
    with tempfile.TemporaryDirectory(prefix=".deps-install-", dir=root) as staging:
        candidate = Path(staging) / "deps"
        subprocess.run([sys.executable, "-m", "pip", "install", "--cache-dir", str(root / ".pip-cache"),
                        "--target", str(candidate), "-r", str(root / "requirements.lock")],
                       cwd=root, env=env, check=True)
        candidate.mkdir(exist_ok=True)  # empty requirements are valid
        files = inventory(candidate)
        # Invalidate before exchanging directories: a crash cannot pair a new
        # dependency tree with an old stamp. Installation failure keeps old deps.
        stamp.unlink(missing_ok=True)
        if deps.exists():
            shutil.rmtree(deps)
        candidate.rename(deps)
        temporary = root / ".deps-stamp.tmp"
        temporary.write_text(json.dumps({"fingerprint": expected, "files": files}, sort_keys=True))
        temporary.replace(stamp)


def package(root: Path) -> None:
    # Always write a fresh ZIP. Updating an existing ZIP retains deleted files.
    with tempfile.NamedTemporaryFile(prefix=".artifact-", suffix=".zip", dir=root, delete=False) as f:
        temporary = Path(f.name)
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
            for entry in (root / "main.py", root / "app", root / "deps"):
                if not entry.exists():
                    raise FileNotFoundError(f"Missing artifact input: {entry.name}")
                for path in ([entry] if entry.is_file() else sorted(entry.rglob("*"))):
                    if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc":
                        archive.write(path, path.relative_to(root))
        temporary.replace(root / "artifact.zip")
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    with build_lock(ROOT):
        install_dependencies(ROOT)
        package(ROOT)
    print("artifact.zip generated (main.py + app/ + deps/)")


if __name__ == "__main__":
    main()

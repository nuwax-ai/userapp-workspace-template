"""Real pip, tiny local wheels: no external package index or backend dependencies."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/build-standalone.py"


def wheel(root, version):
    name = f"cache_probe-{version}-py3-none-any.whl"
    info = f"cache_probe-{version}.dist-info"
    files = {
        "cache_probe.py": f"VERSION = '{version}'\n",
        f"{info}/METADATA": f"Metadata-Version: 2.1\nName: cache-probe\nVersion: {version}\n",
        f"{info}/WHEEL": "Wheel-Version: 1.0\nGenerator: test\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
    }
    files[f"{info}/RECORD"] = "".join(f"{key},,\n" for key in files) + f"{info}/RECORD,,\n"
    with zipfile.ZipFile(root / name, "w") as archive:
        for key, value in files.items():
            archive.writestr(key, value)
    return name


class CacheTests(unittest.TestCase):
    def test_real_pip_reuse_change_failure_and_clean_artifact(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            index = root / "index"
            simple = index / "simple/cache-probe"
            simple.mkdir(parents=True)
            names = [wheel(index, version) for version in ["1.0", "2.0"]]
            (simple / "index.html").write_text("\n".join(f'<a href="../../{name}">{name}</a>' for name in names))
            requests = []

            class Handler(SimpleHTTPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=str(index), **kwargs)

                def do_GET(self):
                    requests.append(self.path)
                    super().do_GET()

                def end_headers(self):
                    self.send_header("Cache-Control", "public, max-age=3600")
                    super().end_headers()

                def log_message(self, *args):
                    pass

            server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
            project = root / "project"
            (project / "scripts").mkdir(parents=True)
            shutil.copyfile(SCRIPT, project / "scripts/build-standalone.py")
            (project / "app").mkdir()
            (project / "app/old.py").write_text("old = True\n")
            (project / "main.py").write_text("pass\n")
            lock = project / "requirements.lock"
            lock.write_text("cache-probe==1.0\n")
            env = {k: v for k, v in os.environ.items() if not k.startswith("PIP_")}
            env.update(PIP_INDEX_URL=f"http://127.0.0.1:{server.server_port}/simple/", PIP_TRUSTED_HOST="127.0.0.1",
                       PIP_NO_CACHE_DIR="1", PIP_DISABLE_PIP_VERSION_CHECK="1", PIP_RETRIES="0")

            def build(success=True):
                result = subprocess.run([sys.executable, str(project / "scripts/build-standalone.py")],
                                        env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
                return result.stdout

            build()
            self.assertTrue(requests)
            count = len(requests)
            (project / "app/old.py").unlink()
            self.assertIn("no pip request", build())
            self.assertEqual(len(requests), count)
            with zipfile.ZipFile(project / "artifact.zip") as archive:
                self.assertNotIn("app/old.py", archive.namelist())
                self.assertFalse(any(name.startswith((".pip-cache", ".deps")) for name in archive.namelist()))
            self.assertTrue(any((project / ".pip-cache").rglob("*")), "image-wide no-cache env must be overridden")
            lock.write_text("cache-probe==2.0\n")
            build()
            self.assertIn("2.0", (project / "deps/cache_probe.py").read_text())
            # A deleted installed file invalidates a matching stamp.
            (project / "deps/cache_probe.py").unlink()
            wheel_requests = sum(path.endswith('.whl') for path in requests)
            build()
            self.assertTrue((project / "deps/cache_probe.py").exists())
            self.assertEqual(sum(path.endswith('.whl') for path in requests), wheel_requests,
                             'reinstall should reuse the persistent wheel download')
            before = (project / ".deps-stamp").read_bytes()
            lock.write_text("cache-probe==99.0\n")
            build(success=False)
            self.assertEqual((project / ".deps-stamp").read_bytes(), before)
            self.assertIn("2.0", (project / "deps/cache_probe.py").read_text())

    def test_platform_change_invalidates_stamp(self):
        spec = importlib.util.spec_from_file_location("standalone_build", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertFalse(module.reusable_lock('-r other-requirements.txt'))
        self.assertFalse(module.reusable_lock('-e ../library'))
        self.assertFalse(module.reusable_lock('fastapi>=0.100'))
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "requirements.lock").write_text("")
            original = module.fingerprint(root)
            with patch.object(module.sysconfig, "get_platform", return_value="different-platform"):
                self.assertNotEqual(original, module.fingerprint(root))


if __name__ == "__main__":
    unittest.main()

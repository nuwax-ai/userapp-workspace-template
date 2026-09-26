"""No dependency installation: package the stdlib-only worker for the prod run command."""
from pathlib import Path
import zipfile

source = Path("main.py")
compile(source.read_bytes(), str(source), "exec")
with zipfile.ZipFile("artifact.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
    archive.write(source, "main.py")

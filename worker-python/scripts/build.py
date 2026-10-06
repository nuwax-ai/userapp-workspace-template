"""Package the worker and runtime resources; dependency installation stays explicit."""
from pathlib import Path
from artifact_pack import package_runtime

root = Path.cwd()
compile((root / "main.py").read_bytes(), "main.py", "exec")
package_runtime(root, required=("main.py",))
print("artifact.zip generated with worker modules, scripts and runtime resources")

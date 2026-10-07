"""Atomic runtime ZIPs for UserApp templates (Python 3.11+; standard library only).

This file is maintained in backend-python/scripts and copied unchanged into
other templates by cli/scripts/pack-templates.mjs. .artifactignore contains
relative glob exclusions, without negation; it never overrides private inputs.
"""
from __future__ import annotations

import argparse
import fnmatch
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import tomllib
import zipfile

PRIVATE_DIRS = {'.git', '.hg', '.svn', '.ssh', '.aws', '.agents', '.claude',
                '.codex', '.opencode', '.secrets', 'secrets', 'credentials'}
CACHE_DIRS = {'__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
              '.pip-cache', '.cache', '.venv', 'venv', 'logs', '.logs', 'coverage',
              '.turbo', '.run', '.previous', '.staging', '.local-deploy',
              '.local-logs', 'builds', 'tmp', '.tmp', 'migration-receipts'}
BUILD_DIRS = {'node_modules', 'target', 'vendor', '.next', '.mvn', 'dist', 'out',
              'build', 'tests', 'test', 'docs'}
COMPILED_SOURCE_DIRS = {'src', 'cmd', 'internal'}
BUILD_FILES = {'project.manifest.toml', 'workspace.manifest.toml', 'release.lock.toml',
               '.artifactignore', '.npmrc', '.pypirc', 'AGENTS.md', 'CLAUDE.md',
               'README.md', 'Dockerfile', 'Makefile', 'pom.xml', 'mvnw', 'mvnw.cmd',
               'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'package.json',
               'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig.json',
               'requirements.lock', 'requirements.txt', '.DS_Store'}
OLD_OUTPUTS = {'artifact.zip', 'userapp-next-standalone.zip'}
SourceSnapshot = dict[Path, tuple[os.stat_result | None, tuple[str, ...] | None]]


def private(name: str) -> bool:
    lower = name.lower()
    return (lower in PRIVATE_DIRS or lower in {'.npmrc', '.pypirc', 'id_rsa', 'id_ed25519'}
            or (lower.startswith('.env') and lower not in {'.env.example', '.env.sample'})
            or lower.endswith(('.key', '.p12', '.pfx')))


def relative(value: str) -> PurePosixPath:
    path = PurePosixPath(value.replace('\\', '/'))
    if not value or path.is_absolute() or '..' in path.parts:
        raise ValueError(f'Artifact path must stay relative: {value}')
    return path


def exclusions(root: Path) -> list[str]:
    path = root / '.artifactignore'
    if not path.exists():
        return []
    if path.is_symlink():
        raise ValueError('.artifactignore must be a regular project file')
    result = []
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        value = raw.strip()
        if not value or value.startswith('#'):
            continue
        if value.startswith('!'):
            raise ValueError(f'.artifactignore:{number}: negation is not supported')
        relative(value)
        result.append(value.rstrip('/'))
    return result


def excluded(path: PurePosixPath, patterns: list[str], mode: str, primary: bool) -> bool:
    if any(private(part) for part in path.parts):
        return True
    if any(part in CACHE_DIRS or part.startswith(('.deps-install-', '.artifact-'))
           for part in path.parts):
        return True
    name = path.name
    if (name in OLD_OUTPUTS or name.startswith(('.deps-', '.deploy-'))
            or name.endswith(('.pyc', '.pyo', '.log', '.tmp', '.tsbuildinfo'))):
        return True
    # Explicit standalone/static output owns its traced dependencies and static
    # build tree. Source extras never pull the entire node_modules/target cache.
    if not primary:
        if any(part in BUILD_DIRS for part in path.parts) or name in BUILD_FILES:
            return True
        if mode != 'source' and (any(part in COMPILED_SOURCE_DIRS for part in path.parts)
                                 or name.endswith(('.go', '.rs', '.java', '.class', '.ts', '.tsx'))):
            return True
        if mode != 'source' and 'deps' in path.parts:
            return True
    text = path.as_posix()
    return any(fnmatch.fnmatchcase(text, pattern) or text.startswith(pattern + '/')
               or (('/' not in pattern) and any(fnmatch.fnmatchcase(part, pattern) for part in path.parts))
               for pattern in patterns)


def command_entries(root: Path) -> list[tuple[str, bool]]:
    manifest = root / 'project.manifest.toml'
    if not manifest.exists():
        return []
    if manifest.is_symlink():
        raise ValueError('project.manifest.toml must not be a symlink')
    with manifest.open('rb') as handle:
        config = tomllib.load(handle)
    run = config.get('run', {})
    if config.get('project', {}).get('type') == 'static' and run:
        raise ValueError('Static prod output cannot declare a run or migrate command')
    paths = []
    for command in (run.get('command', []), run.get('migrate', [])):
        if not isinstance(command, list) or any(not isinstance(value, str) for value in command):
            raise ValueError('run.command and run.migrate must be argv arrays')
        if not command:
            continue
        executable = command[0]
        # argv data is opaque. Only the executable's explicit relative path and
        # direct file-entry forms have enough structure for an artifact check.
        # Flags, shell -c text and interpreter -c/-m are verified by actual runs.
        candidates = []
        if '/' in executable and not executable.startswith('/') and '://' not in executable:
            candidates.append((executable, True))
        # A relative local binary named ./node or ./python3 can be an unrelated
        # program; its argv must remain opaque as for every local executable.
        interpreter = PurePosixPath(executable).name if executable.startswith('/') else executable
        if (re.fullmatch(r'python(?:[23](?:\.\d+)*)?', interpreter)
                or interpreter in {'node', 'nodejs', 'sh', 'bash', 'dash', 'zsh', 'ksh'}):
            if len(command) > 1 and command[1] and not command[1].startswith('-'):
                candidates.append((command[1], False))
        elif interpreter == 'java' and len(command) > 2 and command[1] == '-jar':
            candidates.append((command[2], False))
        for value, executable_required in candidates:
            if value and not value.startswith('/') and '://' not in value:
                paths.append((relative(value).as_posix(), executable_required))
    return paths


def command_inputs(root: Path) -> list[str]:
    return [path for path, _ in command_entries(root)]


def collect(root: Path, *, mode: str, output: Path | None = None,
            layout_root: Path | None = None, include_extras: bool = True,
            include_directories: bool = False,
            snapshot: SourceSnapshot | None = None) -> dict[str, tuple[Path, os.stat_result]]:
    root = root.resolve(strict=True)
    patterns = exclusions(root)
    files: dict[str, tuple[Path, os.stat_result]] = {}

    def walk(path: Path, archive_path: PurePosixPath, boundary: Path,
             ancestors: set[Path], primary: bool):
        if output is not None and path.absolute() == output.absolute():
            return
        if archive_path.parts and excluded(archive_path, patterns, mode, primary):
            return
        if snapshot is not None and path.is_symlink():
            snapshot.setdefault(path, (path.lstat(), None))
        real = path.resolve(strict=True)
        try:
            real.relative_to(boundary)
        except ValueError as error:
            raise ValueError(f'Artifact symlink escapes its runtime tree: {archive_path}') from error
        canonical_relative = PurePosixPath(real.relative_to(boundary).as_posix())
        if any(private(part) for part in canonical_relative.parts):
            raise ValueError(f'Artifact symlink exposes private input: {archive_path}')
        if path.is_symlink() and excluded(canonical_relative, patterns, mode, primary):
            raise ValueError(f'Artifact symlink targets excluded input: {archive_path}')
        metadata = real.stat()
        if stat.S_ISDIR(metadata.st_mode):
            if real in ancestors:
                raise ValueError(f'Artifact symlink directory cycle: {archive_path}')
            children = sorted(real.iterdir(), key=lambda entry: entry.name)
            if snapshot is not None:
                snapshot.setdefault(real, (metadata, tuple(child.name for child in children)))
            for child in children:
                walk(child, archive_path / child.name, boundary, ancestors | {real}, primary)
            if archive_path.parts and (include_directories or not children):
                files.setdefault(archive_path.as_posix() + '/', (real, metadata))
        elif stat.S_ISREG(metadata.st_mode):
            if snapshot is not None:
                snapshot.setdefault(real, (metadata, None))
            name = archive_path.as_posix()
            if name in files and files[name][0] != real:
                if files[name][0].read_bytes() != real.read_bytes():
                    raise ValueError(f'Standalone output conflicts with runtime resource: {name}')
            else:
                files[name] = real, metadata
        else:
            raise ValueError(f'Artifact input is not a regular file or directory: {archive_path}')

    if layout_root is not None:
        layout = layout_root.resolve(strict=True)
        layout.relative_to(root)
        walk(layout, PurePosixPath(), layout, set(), True)
    if include_extras:
        for path in sorted(root.iterdir(), key=lambda entry: entry.name):
            walk(path, PurePosixPath(path.name), root, set(), False)
    return files


def require_inputs(files: dict[str, tuple[Path, os.stat_result]], paths: list[str], *,
                   regular: bool = False, executable: bool = False) -> None:
    for value in paths:
        path = relative(value).as_posix()
        present = path in files
        is_directory = path + '/' in files or any(name.startswith(path + '/') for name in files)
        if not present and not is_directory:
            raise FileNotFoundError(f'Runtime input missing from artifact: {path}')
        if (regular or executable) and (not present or not stat.S_ISREG(files[path][1].st_mode)):
            raise ValueError(f'Runtime input must be a regular file: {path}')
        if executable and not files[path][1].st_mode & 0o111:
            raise ValueError(f'Runtime command must be executable: {path}')


def require_commands(root: Path, files: dict[str, tuple[Path, os.stat_result]]) -> None:
    for path, executable in command_entries(root):
        require_inputs(files, [path], regular=True, executable=executable)


def copy_checked(path: Path, observed: os.stat_result, destination) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as source:
        actual = os.fstat(source.fileno())
        if (actual.st_dev, actual.st_ino) != (observed.st_dev, observed.st_ino):
            raise ValueError(f'Artifact input identity changed: {path.name}')
        if not stat.S_ISREG(actual.st_mode):
            raise ValueError(f'Artifact input must remain a regular file: {path.name}')
        if (actual.st_size, actual.st_mtime_ns, actual.st_mode) != (observed.st_size, observed.st_mtime_ns, observed.st_mode):
            raise ValueError(f'Artifact input changed before copying: {path.name}')
        shutil.copyfileobj(source, destination)
        after = os.fstat(source.fileno())
        if (after.st_size, after.st_mtime_ns, after.st_mode) != (actual.st_size, actual.st_mtime_ns, actual.st_mode):
            raise ValueError(f'Artifact input changed while copying: {path.name}')


def static_directory(root: Path, directory: Path) -> tuple[Path, Path]:
    root = root.resolve(strict=True)
    directory = root.joinpath(*relative(str(directory)).parts)
    if directory.is_symlink():
        raise ValueError('Static runtime directory must not be a symlink')
    directory = directory.resolve(strict=True)
    directory.relative_to(root)
    if directory == root or not directory.is_dir():
        raise ValueError('Static output must be a derived directory inside the project root')
    return root, directory


def check_static_directory(root: Path, directory: Path, *, required: tuple[str, ...] = ()) -> None:
    root, directory = static_directory(root, directory)
    patterns = exclusions(root)
    # The platform packages this exact tree and skips symlinks. A filtered map
    # alone cannot validate it: reject anything that requires preparation.
    def check(path: Path, relative_path: PurePosixPath):
        if path.is_symlink():
            raise ValueError(f'Static runtime contains an unmaterialized symlink: {relative_path}')
        if excluded(relative_path, patterns, 'static', True):
            raise ValueError(f'Static runtime contains excluded input: {relative_path}')
        metadata = path.stat()
        if stat.S_ISDIR(metadata.st_mode):
            for child in sorted(path.iterdir(), key=lambda entry: entry.name):
                check(child, relative_path / child.name)
        elif not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f'Static runtime input is not a regular file or directory: {relative_path}')
    for child in sorted(directory.iterdir(), key=lambda entry: entry.name):
        check(child, PurePosixPath(child.name))
    files = collect(root, mode='static', layout_root=directory, include_extras=False)
    require_inputs(files, list(required), regular=True)
    require_commands(root, files)


def remove_owned_directory(directory: Path) -> None:
    # These are uniquely created staging/backup trees. Their copied resource
    # modes may be read-only; make only their real directories removable.
    # Do not follow links retained in the old backup into other project files.
    if not directory.name.startswith(('.artifact-dir-', '.artifact-backup-')):
        raise ValueError('Refusing to remove a directory not owned by artifact preparation')
    for current, children, _ in os.walk(directory, followlinks=False):
        path = Path(current)
        if not path.is_symlink():
            path.chmod(stat.S_IMODE(path.stat().st_mode) | 0o700)
        for child in children:
            path = Path(current) / child
            if not path.is_symlink():
                path.chmod(stat.S_IMODE(path.stat().st_mode) | 0o700)
    shutil.rmtree(directory)


def verify_source_snapshot(snapshot: SourceSnapshot) -> None:
    def signature(metadata: os.stat_result) -> tuple[int, ...]:
        return (metadata.st_dev, metadata.st_ino, metadata.st_mode,
                metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns)
    for path, (observed, children) in snapshot.items():
        try:
            current = path.lstat()
        except FileNotFoundError:
            current = None
        if ((observed is None) != (current is None)
                or (observed is not None and current is not None
                    and signature(observed) != signature(current))):
            raise ValueError(f'Static input changed during preparation: {path.name}')
        if children is not None:
            current_children = tuple(sorted(child.name for child in path.iterdir()))
            if current_children != children:
                raise ValueError(f'Static directory structure changed during preparation: {path.name}')


def prepare_static_directory(root: Path, directory: Path, *, required: tuple[str, ...] = ()) -> None:
    root, directory = static_directory(root, directory)
    original = directory.stat()
    snapshot: SourceSnapshot = {}
    # Exclusion/command contracts can change without changing the output tree.
    # Capture missing files too, so a newly created contract cannot be ignored.
    for name in ('.artifactignore', 'project.manifest.toml'):
        path = root / name
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            metadata = None
        snapshot[path] = (metadata, None)
    files = collect(root, mode='static', layout_root=directory, include_extras=False,
                    include_directories=True, snapshot=snapshot)
    require_inputs(files, list(required), regular=True)
    require_commands(root, files)
    stage = Path(tempfile.mkdtemp(prefix='.artifact-dir-', dir=directory.parent))
    backup: Path | None = None
    preserve_backup = False
    try:
        directories = []
        for name, (path, observed) in sorted(files.items()):
            target = stage.joinpath(*relative(name.rstrip('/')).parts)
            if name.endswith('/'):
                target.mkdir(parents=True, exist_ok=True)
                directories.append((target, observed))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as destination:
                copy_checked(path, observed, destination)
            target.chmod(stat.S_IMODE(observed.st_mode))
        for target, observed in reversed(directories):
            target.chmod(stat.S_IMODE(observed.st_mode))
        stage.chmod(stat.S_IMODE(original.st_mode))
        # Re-check the actual bytes/tree before publishing, with the same
        # project exclusions that will be used by a subsequent --check-dir.
        verify_source_snapshot(snapshot)
        check_static_directory(root, stage.relative_to(root), required=required)
        verify_source_snapshot(snapshot)
        current = directory.stat()
        if (current.st_dev, current.st_ino) != (original.st_dev, original.st_ino):
            raise ValueError('Static output directory identity changed during preparation')
        backup = Path(tempfile.mkdtemp(prefix='.artifact-backup-', dir=directory.parent))
        preserve_backup = True
        try:
            os.replace(directory, backup / 'original')
        except BaseException:
            # A rejected source rename usually leaves the original in place.
            # If the result is uncertain, retain any original that did move.
            preserve_backup = (backup / 'original').exists()
            raise
        try:
            os.replace(stage, directory)
        except BaseException:
            # Never discard the previous directory after a failed publication.
            # If restoring itself fails, leave the uniquely owned backup for
            # diagnosis rather than deleting the only remaining valid output.
            os.replace(backup / 'original', directory)
            preserve_backup = False
            raise
        preserve_backup = False
        remove_owned_directory(backup)
        backup = None
    finally:
        if stage.exists():
            remove_owned_directory(stage)
        if backup is not None and not preserve_backup:
            remove_owned_directory(backup)


def package_runtime(root: Path, *, artifact: str = 'artifact.zip', mode: str = 'source',
                    required: tuple[str, ...] = (), layout_root: Path | None = None) -> None:
    root = root.resolve(strict=True)
    target = root.joinpath(*relative(artifact).parts)
    target.resolve().relative_to(root)
    files = collect(root, mode=mode, output=target, layout_root=layout_root)
    require_inputs(files, list(required))
    require_commands(root, files)
    with tempfile.NamedTemporaryFile(prefix='.artifact-', suffix='.zip', dir=target.parent, delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, (path, observed) in sorted(files.items()):
                if name.endswith('/'):
                    archive.write(path, name)
                    continue
                info = zipfile.ZipInfo.from_file(path, name)
                info.compress_type = zipfile.ZIP_DEFLATED
                with archive.open(info, 'w') as destination:
                    copy_checked(path, observed, destination)
        with zipfile.ZipFile(temporary, 'r') as archive:
            damaged = archive.testzip()
            if damaged is not None:
                raise zipfile.BadZipFile(f'Artifact checksum mismatch: {damaged}')
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--artifact', default='artifact.zip')
    parser.add_argument('--mode', choices=('source', 'compiled', 'standalone', 'static'), default='source')
    parser.add_argument('--required', action='append', default=[])
    parser.add_argument('--layout-root', type=Path)
    static = parser.add_mutually_exclusive_group()
    static.add_argument('--check-dir', type=Path)
    static.add_argument('--prepare-dir', type=Path)
    args = parser.parse_args()
    if args.check_dir:
        check_static_directory(args.root, args.check_dir, required=tuple(args.required))
        print('Static runtime directory validated')
    elif args.prepare_dir:
        prepare_static_directory(args.root, args.prepare_dir, required=tuple(args.required))
        print('Static runtime directory prepared with verified files')
    else:
        package_runtime(args.root, artifact=args.artifact, mode=args.mode,
                        required=tuple(args.required), layout_root=args.layout_root)
        print(f'{args.artifact} generated with verified runtime inputs')


if __name__ == '__main__':
    main()

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


def command_inputs(root: Path) -> list[str]:
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
            candidates.append(executable)
        # A relative local binary named ./node or ./python3 can be an unrelated
        # program; its argv must remain opaque as for every local executable.
        interpreter = PurePosixPath(executable).name if executable.startswith('/') else executable
        if (re.fullmatch(r'python(?:[23](?:\.\d+)*)?', interpreter)
                or interpreter in {'node', 'nodejs', 'sh', 'bash', 'dash', 'zsh', 'ksh'}):
            if len(command) > 1 and command[1] and not command[1].startswith('-'):
                candidates.append(command[1])
        elif interpreter == 'java' and len(command) > 2 and command[1] == '-jar':
            candidates.append(command[2])
        for value in candidates:
            if value and not value.startswith('/') and '://' not in value:
                paths.append(relative(value).as_posix())
    return paths


def collect(root: Path, *, mode: str, output: Path | None = None,
            layout_root: Path | None = None, include_extras: bool = True) -> dict[str, tuple[Path, os.stat_result]]:
    root = root.resolve(strict=True)
    patterns = exclusions(root)
    files: dict[str, tuple[Path, os.stat_result]] = {}

    def walk(path: Path, archive_path: PurePosixPath, boundary: Path,
             ancestors: set[Path], primary: bool):
        if output is not None and path.absolute() == output.absolute():
            return
        if archive_path.parts and excluded(archive_path, patterns, mode, primary):
            return
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
            for child in sorted(real.iterdir(), key=lambda entry: entry.name):
                walk(child, archive_path / child.name, boundary, ancestors | {real}, primary)
            if archive_path.parts and not list(real.iterdir()):
                files.setdefault(archive_path.as_posix() + '/', (real, metadata))
        elif stat.S_ISREG(metadata.st_mode):
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


def require_inputs(files: dict[str, tuple[Path, os.stat_result]], paths: list[str]) -> None:
    for value in paths:
        path = relative(value).as_posix()
        if path not in files and path + '/' not in files and not any(name.startswith(path + '/') for name in files):
            raise FileNotFoundError(f'Runtime input missing from artifact: {path}')


def package_runtime(root: Path, *, artifact: str = 'artifact.zip', mode: str = 'source',
                    required: tuple[str, ...] = (), layout_root: Path | None = None) -> None:
    root = root.resolve(strict=True)
    target = root.joinpath(*relative(artifact).parts)
    target.resolve().relative_to(root)
    files = collect(root, mode=mode, output=target, layout_root=layout_root)
    require_inputs(files, list(required) + command_inputs(root))
    with tempfile.NamedTemporaryFile(prefix='.artifact-', suffix='.zip', dir=target.parent, delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, (path, observed) in sorted(files.items()):
                if name.endswith('/'):
                    archive.write(path, name)
                    continue
                fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
                with os.fdopen(fd, 'rb') as source:
                    actual = os.fstat(source.fileno())
                    if (actual.st_dev, actual.st_ino) != (observed.st_dev, observed.st_ino):
                        raise ValueError(f'Artifact input identity changed: {name}')
                    info = zipfile.ZipInfo.from_file(path, name)
                    info.compress_type = zipfile.ZIP_DEFLATED
                    with archive.open(info, 'w') as destination:
                        shutil.copyfileobj(source, destination)
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
    parser.add_argument('--check-dir', type=Path)
    args = parser.parse_args()
    if args.check_dir:
        directory = (args.root / args.check_dir).resolve(strict=True)
        files = collect(args.root, mode='static', layout_root=directory, include_extras=False)
        require_inputs(files, args.required + command_inputs(args.root))
        print('Static runtime directory validated')
    else:
        package_runtime(args.root, artifact=args.artifact, mode=args.mode,
                        required=tuple(args.required), layout_root=args.layout_root)
        print(f'{args.artifact} generated with verified runtime inputs')


if __name__ == '__main__':
    main()

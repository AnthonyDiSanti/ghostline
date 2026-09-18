#!/usr/bin/env python3
"""Check maintained runtime/test assets without executing their host operations."""
import argparse
import ast
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SEARCH_ROOTS = ('runtime', 'infra/scripts', 'infra/test/fixtures')
TOOL_IMAGES = {
    'shellcheck': 'koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d',
    'hadolint': 'ghcr.io/hadolint/hadolint:v2.14.0@sha256:27086352fd5e1907ea2b934eb1023f217c5ae087992eb59fde121dce9c9ff21e',
}


def discover(root):
    # Include new, untracked fixtures automatically; never traverse ignored recovery data or symlinks.
    found = {'shell': [], 'python': [], 'docker': []}
    for folder in SEARCH_ROOTS:
        directory = root / folder
        if directory.is_symlink() or not directory.is_dir():
            raise RuntimeError(f'Missing asset directory: {folder}')
        for parent, directories, filenames in os.walk(directory, followlinks=False):
            directories[:] = [name for name in directories if not (Path(parent) / name).is_symlink()]
            for name in filenames:
                path = Path(parent) / name
                if path.is_symlink() or not path.is_file():
                    continue
                kind = ('shell' if path.suffix in {'.sh', '.bash'} else 'python' if path.suffix == '.py'
                        else 'docker' if name == 'Dockerfile' or name.lower().endswith('.dockerfile') else None)
                if kind:
                    found[kind].append(path.relative_to(root).as_posix())
    for kind, files in found.items():
        files.sort()
        if not files:
            raise RuntimeError(f'No {kind} assets found; check discovery roots.')
    return found


def check_syntax(root, assets):
    # Use the declared shell and AL2023's Python 3.9 grammar, without executing scripts or writing bytecode.
    for name in assets['shell']:
        source = (root / name).read_text()
        shell = 'bash' if 'bash' in source.splitlines()[0] else 'sh'
        subprocess.run([shell, '-n', name], cwd=root, check=True)
    for name in assets['python']:
        ast.parse((root / name).read_text(), filename=name, feature_version=(3, 9))
    print(f"Syntax passed: {len(assets['shell'])} shell and {len(assets['python'])} Python files.", flush=True)


def lint(root, tool, files, docker=False):
    # Developer environment/home configuration must not quietly disable diagnostics in the project gate.
    environment = {key: value for key, value in os.environ.items()
                   if key != 'SHELLCHECK_OPTS' and not key.startswith('HADOLINT_')}
    options = ['--norc', '--severity=style'] if tool == 'shellcheck' else ['--config', 'infra/hadolint.yaml']
    native = None if docker else shutil.which(tool)
    if native:
        print(f'{tool}: checking {len(files)} files with {native}.', flush=True)
        # Lint findings fail here; Docker is only a missing-tool fallback, never a retry that hides failures.
        subprocess.run([native, *options, *files], cwd=root, env=environment, check=True)
        return
    executable = shutil.which('docker')
    if not executable:
        raise RuntimeError(f'Install {tool} (macOS: brew install {tool}) or start Docker for the pinned fallback.')
    # Mount only a disposable copy of the exact inputs, not the repository's credentials or working state.
    with tempfile.TemporaryDirectory(prefix='ghostline-lint-') as temporary:
        staging = Path(temporary)
        for name in [*files, *(['infra/hadolint.yaml'] if tool == 'hadolint' else [])]:
            destination = staging / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / name, destination)
        print(f'{tool}: checking {len(files)} files with {TOOL_IMAGES[tool]}.', flush=True)
        subprocess.run([executable, 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                        '--security-opt', 'no-new-privileges', '--entrypoint', tool,
                        '-v', f'{staging}:/workspace:ro', '-w', '/workspace',
                        TOOL_IMAGES[tool], *options, *files], cwd=root, env=environment, check=True)


def main():
    # Explicit narrow commands help local debugging; the normal gate runs every asset check.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('check', nargs='?', choices=['all', 'syntax', 'shellcheck', 'hadolint'], default='all')
    parser.add_argument('--docker', action='store_true', help='Use pinned linter containers even when native tools exist')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    assets = discover(root)
    if args.check in {'all', 'syntax'}:
        check_syntax(root, assets)
    for tool, kind in [('shellcheck', 'shell'), ('hadolint', 'docker')]:
        if args.check in {'all', tool}:
            lint(root, tool, assets[kind], docker=args.docker)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode if error.returncode > 0 else 1)
    except (OSError, RuntimeError, SyntaxError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)

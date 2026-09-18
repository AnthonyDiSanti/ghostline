#!/usr/bin/env python3
"""Exercise discovery and process boundaries with temporary files, without requiring lint tools or Docker."""
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('checks', REPO / 'infra/scripts/check-assets.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class AssetChecks(unittest.TestCase):
    def setUp(self):
        # Use actual fixture bytes rather than embedding another shell program in this test.
        self.temporary = tempfile.TemporaryDirectory(prefix='ghostline-check-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in checks.SEARCH_ROOTS:
            (self.root / name).mkdir(parents=True)
        self.shell = 'infra/test/fixtures/nested path/probe.sh'
        self.write(self.shell, (REPO / 'infra/test/fixtures/render.sh').read_text())
        self.write('runtime/example.py', (REPO / 'runtime/ecs/verify.py').read_text())
        self.write('runtime/ARM.Dockerfile', (REPO / 'runtime/ecs/awg.Dockerfile').read_text())
        self.write('infra/hadolint.yaml', (REPO / 'infra/hadolint.yaml').read_text())

    def write(self, name, source):
        # Test workspaces contain only synthetic or public source files.
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source)

    def test_discovery(self):
        self.write('runtime/second.bash', (REPO / 'runtime/ecs/client-awg.sh').read_text())
        self.write('.local/private.sh', (REPO / 'infra/test/fixtures/render.sh').read_text())
        (self.root / 'runtime/link.sh').symlink_to(self.root / '.local/private.sh')
        (self.root / 'runtime/linked-directory').symlink_to(self.root / '.local', target_is_directory=True)
        assets = checks.discover(self.root)
        self.assertEqual(assets['shell'], [self.shell, 'runtime/second.bash'])
        self.assertEqual(assets['docker'], ['runtime/ARM.Dockerfile'])
        self.assertEqual(assets['python'], ['runtime/example.py'])
        with patch.object(checks.subprocess, 'run') as run:
            checks.check_syntax(self.root, assets)
        self.assertEqual([call.args[0][:2] for call in run.call_args_list], [['sh', '-n'], ['bash', '-n']])

    def test_empty_discovery(self):
        (self.root / self.shell).unlink()
        with self.assertRaisesRegex(RuntimeError, 'No shell assets'):
            checks.discover(self.root)

    def test_missing_directory(self):
        (self.root / 'infra/scripts').rmdir()
        with self.assertRaisesRegex(RuntimeError, 'Missing asset directory'):
            checks.discover(self.root)

    def test_missing_tools(self):
        with patch.object(checks.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'brew install shellcheck'):
                checks.lint(self.root, 'shellcheck', [self.shell])

    def test_native_failure(self):
        # An installed tool's findings cannot trigger a second, potentially differently configured linter.
        for tool in checks.TOOL_IMAGES:
            with self.subTest(tool=tool), patch.object(checks.shutil, 'which', return_value=f'/bin/{tool}'), \
                    patch.object(checks.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, tool)) as run, \
                    patch.dict(os.environ, {'SHELLCHECK_OPTS': '--exclude=SC2086', 'HADOLINT_IGNORE': 'DL3007'}):
                with self.assertRaises(subprocess.CalledProcessError):
                    checks.lint(self.root, tool, [self.shell])
                run.assert_called_once()
                self.assertEqual(run.call_args.args[0][-1], self.shell)
                self.assertNotIn('SHELLCHECK_OPTS', run.call_args.kwargs['env'])
                self.assertNotIn('HADOLINT_IGNORE', run.call_args.kwargs['env'])

    def test_docker_fallback(self):
        # Inspect exactly what the container could read and prove cleanup on success and lint failure.
        for tool, selected in [('shellcheck', self.shell), ('hadolint', 'runtime/ARM.Dockerfile')]:
            for fails in [False, True]:
                staged = []

                def run(args, **kwargs):
                    mount = args[args.index('-v') + 1]
                    directory = Path(mount.removesuffix(':/workspace:ro'))
                    staged.append(directory)
                    actual = {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
                    expected = {selected} | ({'infra/hadolint.yaml'} if tool == 'hadolint' else set())
                    self.assertEqual(actual, expected)
                    self.assertEqual((directory / selected).read_bytes(), (self.root / selected).read_bytes())
                    self.assertEqual(args[args.index('--network') + 1], 'none')
                    self.assertIn('--read-only', args)
                    self.assertIn(checks.TOOL_IMAGES[tool], args)
                    self.assertEqual(args[-1], selected)
                    if fails:
                        raise subprocess.CalledProcessError(1, args)

                with self.subTest(tool=tool, fails=fails), patch.object(checks.shutil, 'which', side_effect=lambda name: '/bin/docker' if name == 'docker' else None), \
                        patch.object(checks.subprocess, 'run', side_effect=run):
                    if fails:
                        with self.assertRaises(subprocess.CalledProcessError):
                            checks.lint(self.root, tool, [selected])
                    else:
                        checks.lint(self.root, tool, [selected])
                self.assertEqual(len(staged), 1)
                self.assertFalse(staged[0].exists())


if __name__ == '__main__':
    unittest.main()

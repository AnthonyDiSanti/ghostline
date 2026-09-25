#!/usr/bin/env python3
"""Check the real image's packaging boundary without host authority or network access."""
import importlib
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, '/opt/ghostline')
kind = sys.argv[1]
for name in ('guard', 'network'):
    importlib.import_module(name)
if kind == 'network-daemon':
    # Host diagnostic/import capabilities must not accidentally leak through a broad COPY.
    for name in ('daemon', 'discovery'):
        importlib.import_module(name)
    for name in ('bootstrap.py', 'storage.py', 'boot_observation.py', 'host_support.py', 'diagnostics.py', 'isolation.py', 'network-probe.py'):
        assert not (Path('/opt/ghostline') / name).exists(), name
    # Alpine's BusyBox supplies some host-tool applets even without util-linux. Check
    # the added packages; authority is constrained separately by the native task policy.
    assert shutil.which('docker') is None
    packages = subprocess.check_output(['apk', 'info'], text=True).splitlines()
    assert not {'docker-cli', 'util-linux', 'coreutils'}.intersection(packages)
elif kind == 'bootstrap':
    for name in ('bootstrap', 'storage', 'boot_observation', 'diagnostics', 'isolation', 'host_support'):
        importlib.import_module(name)
    assert not (Path('/opt/ghostline') / 'daemon.py').exists()
    assert shutil.which('docker') and shutil.which('nsenter')
else:
    raise AssertionError('Unknown image kind')
assert importlib.import_module('guard').LEASE_SECONDS == 5
print(f'{kind}: expected modules and package boundary verified')

#!/usr/bin/env python3
"""Each case changes one independently enforced mount or permission requirement."""
from pathlib import Path
import importlib.util
import json
import stat
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('verify', Path(__file__).resolve().parents[3] / 'runtime/ecs/verify.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
results = {}
for protocol in ['xray', 'awg']:
    results[protocol] = {}
    for mode in ['valid', 'disk', 'writable', 'wrong-source', 'wrong-type', 'owner', 'permissions', 'file-mode', 'file-owner', 'missing-noexec']:
        mount = {'Type': 'volume' if mode == 'wrong-type' else 'bind',
                 'Source': '/disk' if mode == 'wrong-source' else f'/run/ghostline-config/{protocol}', 'RW': mode == 'writable'}
        directory_mode, file_mode = (0o700, 0o400) if protocol == 'xray' else (0o750, 0o440)
        metadata = SimpleNamespace(st_uid=0 if mode == 'owner' else 65532, st_gid=65532,
                                   st_mode=stat.S_IFDIR | (0o755 if mode == 'permissions' else directory_mode))
        file_metadata = SimpleNamespace(st_uid=0 if mode == 'file-owner' else 65532, st_gid=65532,
                                        st_mode=stat.S_IFREG | (0o444 if mode == 'file-mode' else file_mode))
        path = SimpleNamespace(parent=SimpleNamespace(stat=lambda: metadata), stat=lambda: file_metadata)

        def run(args):
            if args[0] == 'stat':
                return 'ext4' if mode == 'disk' else 'tmpfs'
            return json.dumps({'filesystems': [{'fstype': 'tmpfs', 'options': 'rw,nosuid,nodev' + ('' if mode == 'missing-noexec' else ',noexec')}]})
        v.run = run
        try:
            v.verify_config_storage(path, mount, protocol)
            results[protocol][mode] = True
        except RuntimeError:
            results[protocol][mode] = False

# Values never enter test output, even when an empty injected secret or AWS endpoint is rejected.
results['environment'] = []
for environment in [['PATH=/bin'], ['GHOSTLINE_CONFIG='], ['GHOSTLINE_CONFIG=synthetic'],
                    ['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI=/synthetic'], ['AWS_SECRET_ACCESS_KEY=synthetic']]:
    try:
        v.verify_engine_environment(environment)
        results['environment'].append(True)
    except RuntimeError:
        results['environment'].append(False)
print(json.dumps(results))

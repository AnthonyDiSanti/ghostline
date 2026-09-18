#!/usr/bin/env python3
"""Reject independent engine ceilings and missing task enforcement using numeric fixture files."""
from pathlib import Path
import importlib.util
import json
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('verify', Path(__file__).resolve().parents[3] / 'runtime/ecs/verify.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
results = {}
parent = '/sys/fs/cgroup/ecs/task'
for case in ['valid', 'uncapped', 'engine-cap', 'oom', 'disabled', 'unrelated']:
    files = {
        '/etc/ghostline-memory.env': 'GHOSTLINE_TASK_MEMORY=1126\n',
        '/etc/ecs/ecs.config': 'ECS_RESERVED_MEMORY=666\nECS_ENABLE_TASK_CPU_MEM_LIMIT=' + ('false' if case == 'disabled' else 'true'),
        parent + '/memory.max': 'max' if case == 'uncapped' else str(1126 * 1048576),
        parent + '/memory.current': str(80 * 1048576),
        parent + '/memory.events': 'oom 1\noom_kill 1' if case == 'oom' else 'oom 0\noom_kill 0',
        parent + '/xray/memory.max': '256' if case == 'engine-cap' else 'max',
        parent + '/awg/memory.max': 'max',
    }
    groups = [Path(parent + '/xray'), Path(parent + '/awg')]
    if case == 'unrelated':
        groups[1] = Path('/sys/fs/cgroup/unrelated/awg')
    with patch.object(Path, 'read_text', lambda path: files[str(path)]):
        try:
            results[case] = v.verify_gateway_memory(groups)
        except (RuntimeError, ValueError, KeyError):
            results[case] = False
print(json.dumps(results))

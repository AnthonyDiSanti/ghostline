#!/usr/bin/env python3
"""Emulation must not count as native architecture validation."""
from pathlib import Path
import importlib.util
import json

spec = importlib.util.spec_from_file_location('verify', Path(__file__).resolve().parents[3] / 'runtime/ecs/verify.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
results = []
for host, image in [('x86_64', 'amd64'), ('aarch64', 'arm64'), ('aarch64', 'amd64'), ('x86_64', 'arm64')]:
    v.platform.machine = lambda: host
    v.run = lambda args: image if args[1] == 'image' else 'sha256:fixture'
    try:
        results.append(v.verify_architecture('container'))
    except RuntimeError:
        results.append('rejected')
print(json.dumps(results))

#!/usr/bin/env python3
"""Check cold readiness, stale leases and nonsecret peer observations without networking authority."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'runtime/ecs/bottlerocket'))
import readiness

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'health.json'
    assert not readiness.snapshot(path, 10)['healthy']
    path.write_text(json.dumps({'tick': 9, 'peers': {}}))
    assert readiness.snapshot(path, 10) == {'schema': 1, 'healthy': True, 'peers': {}}
    peer = {'xray': {'task': 'synthetic', 'id': 'a' * 64, 'ip': '172.17.0.2'}}
    path.write_text(json.dumps({'tick': 9, 'peers': peer}))
    assert readiness.snapshot(path, 10)['peers'] == peer
    for now in [8, 12, 30]:
        assert readiness.snapshot(path, now) == {'schema': 1, 'healthy': False, 'peers': {}}
    path.write_text('{incomplete')
    assert not readiness.snapshot(path, 10)['healthy']
print('bounded readiness passed')

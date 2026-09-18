#!/usr/bin/env python3
"""Exercise restart generations and selective flow cleanup through the real reconciler."""
from pathlib import Path
import importlib.util
import json
import contextlib
import io
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('network', Path(__file__).resolve().parents[3] / 'runtime/ecs/network.py')
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)
c = {'interface': 'ens5', 'xray': '10.79.0.11', 'awg': '10.79.0.10'}
old = {'xray': {'ip': '172.17.0.2', 'id': 'x', 'started': 'first'},
       'awg': {'ip': '172.17.0.3', 'id': 'a', 'started': 'first'}}
results = {}
for scenario in ['cold', 'restart', 'remove', 'move']:
    peers = {name: dict(peer) for name, peer in old.items()}
    if scenario == 'restart':
        peers['awg']['started'] = 'second'
    if scenario == 'remove':
        del peers['awg']
    if scenario == 'move':
        peers['awg']['ip'] = '172.17.0.4'
    calls = []
    n.replace_chain = lambda table, chain, rules: calls.append([table, chain, rules])

    def run(args, **_kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=1)

    with patch.object(n.subprocess, 'run', run), patch.object(n.Path, 'write_text'), contextlib.redirect_stdout(io.StringIO()):
        n.reconcile(c, peers, None if scenario == 'cold' else old)
    results[scenario] = calls
print(json.dumps(results))

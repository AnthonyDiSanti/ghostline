#!/usr/bin/env python3
"""Feed Docker metadata into real discovery, including same-ID restarts and ambiguous containers."""
from pathlib import Path
import importlib.util
import json

spec = importlib.util.spec_from_file_location('network', Path(__file__).resolve().parents[3] / 'runtime/ecs/network.py')
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)
results = {}
for scenario in ['initial', 'restart', 'duplicate', 'foreign-network', 'same-address', 'not-running', 'no-address']:
    calls = []

    def command(args):
        calls.append(args)
        if args[1] == 'ps':
            name = next(arg.split('=')[-1] for arg in args if arg.startswith('label=com.amazonaws.ecs.container-name='))
            return name + (' extra' if scenario == 'duplicate' else '')
        name = args[-1]
        return json.dumps({'state': {'Running': scenario != 'not-running', 'Pid': 123,
                                     'StartedAt': 'second' if scenario == 'restart' and name == 'awg' else 'first'},
                           'networks': {'foreign' if scenario == 'foreign-network' else 'bridge': {
                               'IPAddress': '' if scenario == 'no-address' and name == 'awg' else
                               '172.17.0.2' if name == 'xray' or scenario == 'same-address' else '172.17.0.3'}}})


    n.command = command
    try:
        peers = n.discover({'family': 'selected'})
        results[scenario] = peers
    except (ValueError, RuntimeError):
        results[scenario] = False
    assert all('label=com.amazonaws.ecs.task-definition-family=selected-gateway' in call for call in calls if call[1] == 'ps')
    assert all('.Config.Env' not in ' '.join(call) for call in calls)
print(json.dumps(results))

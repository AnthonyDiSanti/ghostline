#!/usr/bin/env python3
"""Exercise the actual policy builder without invoking the host packet filter."""
from pathlib import Path
import importlib.util
import json

spec = importlib.util.spec_from_file_location('network', Path(__file__).resolve().parents[3] / 'runtime/ecs/network.py')
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)
c = {'interface': 'ens5', 'xray': '10.79.0.11', 'awg': '10.79.0.10'}
p = {'xray': {'ip': '172.17.0.2', 'id': 'x'}, 'awg': {'ip': '172.17.0.3', 'id': 'a'}}
rules, nat = n.policy(c, p)
empty, _ = n.policy(c, {})
print(json.dumps({'rules': rules, 'nat': nat, 'empty': empty}))

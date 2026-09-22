#!/usr/bin/env python3
"""Test authoritative listener mapping without Docker, host files or network privileges."""
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'runtime/ecs/bottlerocket'))
import discovery


def document():
    # Repeated identical port tuples are observed on the real agent; order is not identity.
    return {'Tasks': [{'Arn': 'task-one', 'Family': 'trial-gateway', 'KnownStatus': 'RUNNING', 'DesiredStatus': 'RUNNING',
                       'Containers': [{'Name': name, 'DockerId': char * 64, 'StartedAt': '2026-09-21T00:00:00Z',
                                       'RestartCount': 0, 'Ports': [{'ContainerPort': 443, 'HostPort': 443, 'Protocol': protocol}] * 2}
                                      for name, char, protocol in [('xray', 'a', 'tcp'), ('awg', 'b', 'udp')]]}]}


def rejected(call):
    try:
        call()
    except (RuntimeError, ValueError, KeyError):
        return
    raise AssertionError('Unsafe observation was accepted')


rules = '\n'.join(f'-A DOCKER ! -i docker0 -p {protocol} -m {protocol} --dport 443 -j DNAT --to-destination {address}:443'
                  for protocol, address in [('tcp', '172.17.0.3'), ('udp', '172.17.0.2')])
bridge = [{'addr_info': [{'family': 'inet', 'local': '172.17.0.1', 'prefixlen': 16}]}]
command = lambda args: json.dumps(bridge) if args[0] == 'ip' else rules
peers = discovery.discover({'family': 'trial'}, command, document)
assert peers['xray']['ip'] == '172.17.0.3' and peers['awg']['ip'] == '172.17.0.2'
assert discovery.discover({'family': 'other'}, command, document) == {}
rejected(lambda: discovery.destinations(rules + '\n' + rules, '172.17.0.0/16'))
rejected(lambda: discovery.destinations(rules.replace('172.17.0.3', '10.79.0.10'), '172.17.0.0/16'))
rejected(lambda: discovery.destinations(rules.replace('172.17.0.3', '172.17.0.2'), '172.17.0.0/16'))
rejected(lambda: discovery.destinations(rules.replace('DNAT', 'ACCEPT'), '172.17.0.0/16'))
rejected(lambda: discovery.destinations(rules.replace('! -i docker0', '-i eth0'), '172.17.0.0/16'))
assert discovery.discover({'family': 'trial'}, lambda args: json.dumps(bridge) if args[0] == 'ip' else '', document) == {}
bad = document()
bad['Tasks'] *= 2
rejected(lambda: discovery.identities(bad, 'trial'))
bad = document()
bad['Tasks'][0]['Containers'][0]['Ports'][0]['HostPort'] = 8443
rejected(lambda: discovery.identities(bad, 'trial'))
before = document()
after = copy.deepcopy(before)
after['Tasks'][0]['Containers'][0]['RestartCount'] = 1
sequence = iter([before, after])
rejected(lambda: discovery.discover({'family': 'trial'}, command, lambda: next(sequence)))
after['Tasks'][0]['DesiredStatus'] = 'STOPPED'
assert discovery.identities(after, 'trial') == {}
print('ECS/NAT discovery rejects stale, ambiguous and foreign identities.')

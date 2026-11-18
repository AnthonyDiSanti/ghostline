#!/usr/bin/env python3
"""Exercise the real DERP policy/discovery boundary without touching host networking."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def load(name, path):
    # Load the actual policy implementation; only external packet-filter effects are replaced.
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


network = load('network', ROOT / 'runtime/ecs/network.py')
discovery = load('discovery', ROOT / 'runtime/ecs/bottlerocket/discovery.py')
config = {'interface': 'ens5', 'xray': '10.79.0.11', 'awg': '10.79.0.10', 'dnsRequired': True,
          'dnsSource': '10.79.0.10', 'derp': {'allowedSources': ['198.51.100.42/32']}}
peers = {name: {'ip': f'172.17.0.{index}', 'id': name} for index, name in
         enumerate(['xray', 'awg', 'dns-policy', 'derp'], 2)}
rules, nat = network.policy(config, peers)
chains, jumps = {}, []
network.replace_chain = lambda table, chain, entries: chains.update({f'{table}/{chain}': entries})
network.ensure_jump = lambda *args: jumps.append(args)
network.initialize(config)
rejected = []
for sources in [[], ['0.0.0.0/0'], ['198.51.100.0/24'], ['198.51.100.42/32', '198.51.100.42/32'],
                ['198.51.100.42/32 -j ACCEPT'], ['::/0']]:
    try:
        network.policy({**config, 'derp': {'allowedSources': sources}}, peers)
    except (ValueError, RuntimeError):
        rejected.append(True)
    else:
        rejected.append(False)

bindings = [('tcp', 443, '172.17.0.2', 443), ('udp', 443, '172.17.0.3', 443),
            ('tcp', 55353, '172.17.0.4', 5353), ('udp', 55353, '172.17.0.4', 5353),
            ('tcp', 18443, '172.17.0.5', 8443), ('udp', 3478, '172.17.0.5', 3478)]


def destinations(rows):
    # Docker's published bindings deliberately have no destination-address HostIp discriminator.
    text = '\n'.join(f'-A DOCKER ! -i docker0 -p {protocol} -m {protocol} --dport {host} '
                     f'-j DNAT --to-destination {address}:{port}' for protocol, host, address, port in rows)
    return discovery.destinations(text, '172.17.0.1/16')


bad_bindings = []
for rows in [bindings[:-1], bindings + [bindings[-1]],
             [*bindings[:-1], ('udp', 3478, '172.17.0.3', 3478)]]:
    try:
        destinations(rows)
    except RuntimeError:
        bad_bindings.append(True)
    else:
        bad_bindings.append(False)

print(json.dumps({'rules': rules, 'nat': nat, 'chains': chains, 'jumps': jumps,
                  'redirect': network.public_redirect(config, peers),
                  'missing': network.public_redirect(config, {name: peer for name, peer in peers.items() if name != 'derp'}),
                  'sourcesRejected': rejected, 'bindings': destinations(bindings), 'badBindingsRejected': bad_bindings}))

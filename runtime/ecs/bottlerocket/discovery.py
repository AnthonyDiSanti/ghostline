#!/usr/bin/env python3
"""Join ECS restart identities to Docker-owned published-port NAT destinations."""
import ipaddress
import json
import re
import shlex
import urllib.request
from pathlib import Path

# The build flattens host sources into one image directory; source checkout keeps the policy one level up.
POLICY_PATH = Path(__file__).with_name('dns-policy.json')
if not POLICY_PATH.is_file():
    POLICY_PATH = POLICY_PATH.parent.parent / 'dns-policy.json'
DNS_SETTINGS = json.loads(POLICY_PATH.read_text())
DNS_PORT = int(DNS_SETTINGS['listenPort'])
DNS_HOST_PORT = int(DNS_SETTINGS['hostPort'])
PORTS = {'xray': {(443, 443, 'tcp')}, 'awg': {(443, 443, 'udp')},
         'dns-policy': {(DNS_PORT, DNS_HOST_PORT, 'tcp'), (DNS_PORT, DNS_HOST_PORT, 'udp')}}


def identities(document, family):
    # A draining old task is not an eligible replacement; refuse simultaneous active generations.
    # DNS must reach its upstream before ECS can satisfy the engines' HEALTHY dependency.
    # Admit only its verified binding while the task is pending; engines still require a running task.
    tasks = [task for task in document['Tasks'] if task.get('Family') == family + '-gateway'
             and task.get('DesiredStatus') == 'RUNNING' and task.get('KnownStatus') in ('PENDING', 'RUNNING')]
    if len(tasks) > 1:
        raise RuntimeError('Ambiguous gateway task identity')
    peers = {}
    for task in tasks:
        for container in task['Containers']:
            name = container['Name']
            if name not in PORTS or task['KnownStatus'] == 'PENDING' and name != 'dns-policy':
                continue
            if name in peers or not re.fullmatch('[a-f0-9]{64}', container.get('DockerId', '')):
                raise RuntimeError('Invalid engine identity')
            # ECS can repeat equivalent bindings for multiple address families; normalize only identical tuples.
            ports = {(p['ContainerPort'], p['HostPort'], p['Protocol']) for p in container.get('Ports', [])}
            if ports != PORTS[name]:
                raise RuntimeError('Unexpected gateway port bindings')
            started = container.get('StartedAt')
            restarts = container.get('RestartCount')
            if not isinstance(started, str) or not started.endswith('Z') or not isinstance(restarts, int) or restarts < 0:
                raise RuntimeError('Missing engine restart generation')
            peers[name] = {'id': container['DockerId'], 'started': started, 'restarts': restarts, 'task': task['Arn']}
    return peers


def destinations(rules, bridge):
    # Read Docker's listener bindings, never classify decrypted client traffic by TCP versus UDP.
    targets = {}
    mapping = {('tcp', '443'): ('xray', '443'), ('udp', '443'): ('awg', '443'),
               ('tcp', str(DNS_HOST_PORT)): ('dns-tcp', str(DNS_PORT)),
               ('udp', str(DNS_HOST_PORT)): ('dns-udp', str(DNS_PORT))}
    subnet = ipaddress.ip_network(bridge, strict=False)
    for line in rules.splitlines():
        words = shlex.split(line)
        if words[:2] != ['-A', 'DOCKER']:
            continue
        def value(flag):
            return words[words.index(flag) + 1] if flag in words else None
        protocol = value('-p')
        target = mapping.get((protocol, value('--dport')))
        if not target:
            continue
        # A changed Docker rule shape must be qualified explicitly instead of silently broadening identity selection.
        expected = ['-A', 'DOCKER', '!', '-i', 'docker0', '-p', protocol, '-m', protocol,
                    '--dport', value('--dport'), '-j', 'DNAT', '--to-destination']
        if words[:-1] != expected or target[0] in targets:
            raise RuntimeError('Ambiguous or unsupported Docker NAT binding')
        address, port = words[-1].rsplit(':', 1)
        ip = ipaddress.ip_address(address)
        if port != target[1] or ip not in subnet or ip in {subnet.network_address, subnet.broadcast_address}:
            raise RuntimeError('Invalid bridge destination')
        targets[target[0]] = address
    if targets.get('dns-tcp') != targets.get('dns-udp'):
        if 'dns-tcp' in targets or 'dns-udp' in targets:
            raise RuntimeError('Incomplete DNS bridge binding')
    distinct_peers = [key for key in targets if key != 'dns-udp']
    if len(set(targets.values())) != len(distinct_peers):
        # The two DNS transports intentionally share one container; no engine may share its address.
        raise RuntimeError('Engines share a bridge destination')
    return {**{name: targets[name] for name in ('xray', 'awg') if name in targets},
            **({'dns-policy': targets['dns-tcp']} if 'dns-tcp' in targets else {})}


def snapshot():
    # This local endpoint exposes metadata, not Docker control or injected secret environments.
    with urllib.request.urlopen('http://127.0.0.1:51678/v1/tasks', timeout=2) as response:
        data = response.read(1024 * 1024 + 1)
    if len(data) > 1024 * 1024:
        raise RuntimeError('Oversized ECS metadata')
    return json.loads(data)


def discover(config, command, read=snapshot):
    # Bracket kernel inspection with ECS identity reads to reject mixed restart generations.
    before = identities(read(), config['family'])
    addresses = json.loads(command(['ip', '-j', '-4', 'address', 'show', 'dev', 'docker0']))
    networks = [entry for device in addresses for entry in device['addr_info'] if entry['family'] == 'inet']
    if len(networks) != 1:
        raise RuntimeError('Unexpected Docker bridge addresses')
    bridge = networks[0]
    targets = destinations(command(['iptables', '-w', '-t', 'nat', '-S', 'DOCKER']),
                           f'{bridge["local"]}/{bridge["prefixlen"]}')
    peers = {}
    for name, identity in before.items():
        address = targets.get(name)
        if name == 'dns-policy' and not address:
            raise RuntimeError('DNS identity has no complete Docker binding')
        if address:
            if address == bridge['local']:
                raise RuntimeError('Engine destination is the host bridge')
            peers[name] = {**identity, 'ip': address}
    if before != identities(read(), config['family']):
        raise RuntimeError('Engine identities changed during discovery')
    return peers

#!/usr/bin/env python3
"""Exercise controller lease ordering without changing the developer's networking."""
import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'runtime/ecs'))
sys.path.insert(0, str(root / 'runtime/ecs/bottlerocket'))
spec = importlib.util.spec_from_file_location('br_daemon', root / 'runtime/ecs/bottlerocket/daemon.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

events = []
leases = set()
enforce_guard = host.guard.enforce_order


def command(args):
    # Model only the kernel lease set; NAT updates observe whether stale peers were already withdrawn.
    assert args[0] == 'ipset'
    if args[1] == 'del':
        leases.discard(args[3])
    elif args[1] == 'add':
        assert args[4:] == ['timeout', '5', '-exist']
        leases.add(args[3])
    else:
        raise AssertionError('Unexpected lease operation')
    events.append(args[1])


host.command = command
host.network.command = command
host.network.reconcile = lambda *_: events.append(('nat', set(leases)))
old = {'xray': {'ip': '172.17.0.2', 'started': 'old'}, 'awg': {'ip': '172.17.0.3', 'started': 'same'}}
new = {'xray': {'ip': '172.17.0.4', 'started': 'new'}, 'awg': old['awg']}
leases.update(peer['ip'] for peer in old.values())
host.reconcile({}, new, old)
assert events[0] == 'del'
assert events[1] == ('nat', {'172.17.0.3'})
assert leases == {'172.17.0.3', '172.17.0.4'}
events.clear()
host.reconcile({}, new, new)
assert events == ['add', 'add']

# A DNS peer receives the same expiring identity lease as either engine.
dns = {'ip': '172.17.0.5', 'started': 'dns'}
with_dns = {**new, 'dns-policy': dns}
events.clear()
host.reconcile({'dnsRequired': True}, with_dns, new)
assert events[0] == ('nat', set(peer['ip'] for peer in new.values()))
assert dns['ip'] in leases
events.clear()
host.reconcile({'dnsRequired': True}, with_dns, with_dns)
assert events == ['add', 'add', 'add']
events.clear()
host.reconcile({'dnsRequired': True}, new, with_dns)
assert events[0] == 'del' and events[1] == ('nat', set(peer['ip'] for peer in new.values()))
assert dns['ip'] not in leases

with patch.object(host.guard.network, 'command') as lease_command, \
     patch.object(host.guard.network, 'replace_chain'), \
     patch.object(host.guard.network, 'ensure_jump'), \
     patch.object(host.guard, 'enforce_order'), \
     patch.object(host.guard.subprocess, 'run'):
    host.guard.install()
    lease_command.assert_any_call(['ipset', 'create', 'GHOSTLINE_LIVE', 'hash:net', 'timeout', '5', '-exist'])

# Docker's late MASQUERADE must never win over per-engine identity; repairs revoke leases first.
events.clear()
rules = '-A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE\n-A POSTROUTING -j GHOSTLINE_SNAT'


def ordering_command(args):
    if '-S' in args:
        return rules
    events.append(args)
    return ''


host.command = ordering_command
host.network.command = ordering_command
host.network.initialize = lambda _: events.append('deny')
host.guard.enforce_order = lambda: events.append('guard')
assert host.ensure_nat_order({})
assert events == [
    ['ipset', 'flush', 'GHOSTLINE_LIVE'], 'deny', 'guard',
    ['iptables', '-w', '-t', 'nat', '-D', 'POSTROUTING', '-j', 'GHOSTLINE_SNAT'],
    ['iptables', '-w', '-t', 'nat', '-I', 'POSTROUTING', '1', '-j', 'GHOSTLINE_SNAT'],
]
events.clear()
rules = '\n'.join(reversed(rules.splitlines()))
assert not host.ensure_nat_order({})
assert events == []
rules = '-A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE'
assert host.ensure_nat_order({})
assert sum('-D' in event for event in events if isinstance(event, list)) == 1

# Docker/application ACCEPT rules must never precede the lease check, including after duplicate jumps.
events.clear()
rules = '-A DOCKER-USER -j GHOSTLINE\n-A DOCKER-USER -j GHOSTLINE_LEASE\n-A DOCKER-USER -j GHOSTLINE_LEASE'
enforce_guard()
assert events == [
    ['ipset', 'flush', 'GHOSTLINE_LIVE'],
    ['iptables', '-w', '-D', 'DOCKER-USER', '-j', 'GHOSTLINE_LEASE'],
    ['iptables', '-w', '-D', 'DOCKER-USER', '-j', 'GHOSTLINE_LEASE'],
    ['iptables', '-w', '-I', 'DOCKER-USER', '1', '-j', 'GHOSTLINE_LEASE'],
]
events.clear()
rules = '-A DOCKER-USER -j GHOSTLINE_LEASE\n-A DOCKER-USER -j GHOSTLINE'
enforce_guard()
assert events == []

#!/usr/bin/env python3
"""Host-network-only ECS daemon; no host files, devices, control sockets or secrets."""
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import discovery
import guard
import network
import readiness

HEALTH = Path('/run/ghostline-health.json')


def command(args, data=None):
    # Fail boundedly and report only public networking operations, never arbitrary subprocess output.
    result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=3, check=False)
    if result.returncode:
        raise RuntimeError(f'{args[0]} operation failed: {result.stderr.strip()[:200]}')
    return result.stdout.strip()


def prepare_network(config):
    # One implementation initializes each daemon generation and repairs missing host network state.
    guard.install()
    command(['ip', 'address', 'replace', f'{config["xray"]}/24', 'dev', config['interface']])
    network.initialize(config)
    guard.enforce_order()


def ensure_nat_order(config):
    # Docker may prepend its default masquerade after bootstrap or restart; never repair under live leases.
    rules = [line for line in command(['iptables', '-w', '-t', 'nat', '-S', 'POSTROUTING']).splitlines()
             if line.startswith('-A ')]
    jump = '-A POSTROUTING -j GHOSTLINE_SNAT'
    if rules and rules[0] == jump and rules.count(jump) == 1:
        return False
    guard.withdraw()
    network.initialize(config)
    guard.enforce_order()
    for _ in range(max(1, rules.count(jump))):
        command(['iptables', '-w', '-t', 'nat', '-D', 'POSTROUTING', '-j', 'GHOSTLINE_SNAT'])
    command(['iptables', '-w', '-t', 'nat', '-I', 'POSTROUTING', '1', '-j', 'GHOSTLINE_SNAT'])
    return True


def reconcile(config, peers, previous):
    # Changed identities lose leases before NAT/connection-tracking changes; preserve healthy siblings.
    if peers != previous:
        for name, peer in (previous or {}).items():
            if peers.get(name) != peer:
                command(['ipset', 'del', guard.LEASE, peer['ip'], '-exist'])
        network.reconcile(config, peers, previous)
    for peer in peers.values():
        command(['ipset', 'add', guard.LEASE, peer['ip'], 'timeout', str(guard.LEASE_SECONDS), '-exist'])


def healthy():
    # No engine is required: the daemon must be healthy before the gateway can be placed.
    try:
        age = time.monotonic() - json.loads(HEALTH.read_text())['tick']
        return 0 <= age < 10
    except (OSError, ValueError, KeyError):
        return False


def qualify(config):
    # Unreferenced probe objects exercise the exact capability set without touching live forwarding rules.
    network.command = command
    chain, lease = 'GHOSTLINE_CAP_PROBE', 'GHOSTLINE_CAP_PROBE'
    try:
        command(['iptables', '-w', '-t', 'nat', '-N', chain])
        command(['ipset', 'create', lease, 'hash:ip', 'timeout', '5'])
        command(['ipset', 'add', lease, '198.18.0.254'])
        # libxt_set opens a raw socket even with the nft backend; test the matcher, not just set creation.
        network.replace_chain('nat', chain, [f'-m set --match-set {lease} src -j RETURN'])
        result = subprocess.run(['conntrack', '-D', '--orig-src', '198.18.0.254'], capture_output=True, timeout=3)
        if result.returncode not in (0, 1):
            raise RuntimeError('Connection tracking capability missing')
        peers = discovery.discover(config, command)
        # A cold host can qualify permissions before its gateway is allowed to start.
        if peers and set(peers) != {'xray', 'awg'}:
            raise RuntimeError('Qualification found an incomplete gateway')
        print(json.dumps({'qualified': True, 'engines': sorted(peers)}), flush=True)
    finally:
        # These exact names are reserved only for a serialized disposable qualification task.
        for args in [['iptables', '-w', '-t', 'nat', '-F', chain],
                     ['iptables', '-w', '-t', 'nat', '-X', chain], ['ipset', 'destroy', lease]]:
            subprocess.run(args, capture_output=True, timeout=3, check=False)


def serve(config):
    network.command = command
    config['interface'] = command(['ip', '-4', 'route', 'show', 'default']).split(' dev ')[1].split()[0]
    prepare_network(config)
    observer = readiness.serve(HEALTH)
    previous = None
    def stop(_signal, _frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while True:
            try:
                if ensure_nat_order(config):
                    previous = None
                guard.enforce_order()
                peers = discovery.discover(config, command)
                reconcile(config, peers, previous)
                previous = peers
                # Atomic publication prevents the observer from reading a half-written peer identity set.
                pending = HEALTH.with_suffix('.new')
                pending.write_text(json.dumps({'tick': time.monotonic(), 'peers': peers}))
                pending.replace(HEALTH)
            except Exception as error:
                HEALTH.unlink(missing_ok=True)
                guard.withdraw()
                network.initialize(config)
                guard.enforce_order()
                previous = None
                print(f'Forwarding quarantined: {type(error).__name__}: {error}', flush=True)
            time.sleep(1)
    finally:
        HEALTH.unlink(missing_ok=True)
        guard.withdraw()
        observer.shutdown()
        observer.server_close()


if __name__ == '__main__':
    if sys.argv[1:] == ['health']:
        raise SystemExit(0 if healthy() else 1)
    config = json.loads(os.environ['GHOSTLINE_NETWORK'])
    if sys.argv[1:] == ['qualify']:
        qualify(config)
    elif not sys.argv[1:]:
        serve(config)
    else:
        raise SystemExit('Unknown network daemon action')

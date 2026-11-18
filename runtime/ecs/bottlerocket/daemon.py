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
    try:
        result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=3, check=False)
    except (subprocess.SubprocessError, OSError):
        raise RuntimeError('Network operation failed; details withheld') from None
    if result.returncode:
        raise RuntimeError('Network operation failed; details withheld')
    return result.stdout.strip()


def prepare_network(config):
    # One implementation initializes each daemon generation and repairs missing host network state.
    guard.install()
    command(['ip', 'address', 'replace', f'{config["xray"]}/24', 'dev', config['interface']])
    network.initialize(config)
    guard.enforce_order()


def ensure_nat_order(config):
    # Docker may prepend generic NAT after boot/restart; DERP dispatch and engine SNAT must precede it.
    required = {'POSTROUTING': 'GHOSTLINE_SNAT'}
    if network.derp_sources(config):
        required['PREROUTING'] = 'GHOSTLINE_PUBLIC'
    observed = {chain: [line for line in command(['iptables', '-w', '-t', 'nat', '-S', chain]).splitlines()
                        if line.startswith('-A ')] for chain in required}
    if all(rules and rules[0] == f'-A {chain} -j {required[chain]}'
           and rules.count(rules[0]) == 1 for chain, rules in observed.items()):
        return False
    # Withdraw every lease before resetting chains; the next discovery must repopulate all peer policy.
    guard.withdraw()
    network.initialize(config)
    guard.enforce_order()
    for chain, target in required.items():
        for _ in range(max(1, observed[chain].count(f'-A {chain} -j {target}'))):
            command(['iptables', '-w', '-t', 'nat', '-D', chain, '-j', target])
        command(['iptables', '-w', '-t', 'nat', '-I', chain, '1', '-j', target])
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
        expected = {'xray', 'awg', 'dns-policy'} if config.get('dnsRequired') else {'xray', 'awg'}
        # The pending-task initializer can retrieve only after DNS passes its health gate.
        eligible = [expected, expected | {'gateway-config'}]
        if config.get('dnsRequired'):
            eligible.extend([{'dns-policy'}, {'dns-policy', 'gateway-config'}])
        if peers and set(peers) not in eligible:
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
            except Exception:
                HEALTH.unlink(missing_ok=True)
                guard.withdraw()
                network.initialize(config)
                guard.enforce_order()
                previous = None
                print('Forwarding quarantined: network-reconciliation-failed', flush=True)
            time.sleep(1)
    finally:
        HEALTH.unlink(missing_ok=True)
        guard.withdraw()
        observer.shutdown()
        observer.server_close()


if __name__ == '__main__':
    # Startup/cleanup failures must preserve exit status without dumping captured peer or tool details.
    try:
        if sys.argv[1:] == ['health']:
            raise SystemExit(0 if healthy() else 1)
        config = json.loads(os.environ['GHOSTLINE_NETWORK'])
        if sys.argv[1:] == ['qualify']:
            qualify(config)
        elif not sys.argv[1:]:
            serve(config)
        else:
            raise SystemExit('Unknown network daemon action')
    except Exception:
        print('Network daemon failed; details withheld', file=sys.stderr, flush=True)
        raise SystemExit(1) from None

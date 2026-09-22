#!/usr/bin/env python3
"""A shared, initially empty forwarding guard for bootstrap and daemon recovery."""
import network
import subprocess

LEASE = 'GHOSTLINE_LIVE'
LEASE_SECONDS = 5


def withdraw():
    # Leases live in the kernel so a killed/stalled controller cannot leave indefinite forwarding.
    network.command(['ipset', 'flush', LEASE])


def install():
    # No engine discovery, addressing or NAT belongs in the pre-Docker boot guard.
    network.command(['ipset', 'create', LEASE, 'hash:ip', 'timeout', str(LEASE_SECONDS), '-exist'])
    withdraw()
    network.replace_chain('filter', 'GHOSTLINE_LEASE', [
        f'-i docker0 -m set ! --match-set {LEASE} src -j DROP',
        f'-o docker0 -m set ! --match-set {LEASE} dst -j DROP', '-j RETURN'])
    # Docker preserves DOCKER-USER but can prepend its own FORWARD chains during startup/restoration.
    if subprocess.run(['iptables', '-w', '-n', '-L', 'DOCKER-USER'], capture_output=True).returncode:
        network.command(['iptables', '-w', '-N', 'DOCKER-USER'])
    enforce_order()
    network.ensure_jump('filter', 'FORWARD', ['-j', 'DOCKER-USER'])
    network.ensure_jump('filter', 'INPUT', ['-j', 'GHOSTLINE_LEASE'])


def enforce_order():
    # A direct ACCEPT in a later policy chain must never skip the expiring-lease check.
    rule = '-A DOCKER-USER -j GHOSTLINE_LEASE'
    rules = [line for line in network.command(['iptables', '-w', '-S', 'DOCKER-USER']).splitlines() if line.startswith('-A ')]
    if rules and rules[0] == rule and rules.count(rule) == 1:
        return
    withdraw()
    for _ in range(rules.count(rule)):
        network.command(['iptables', '-w', '-D', 'DOCKER-USER', '-j', 'GHOSTLINE_LEASE'])
    network.command(['iptables', '-w', '-I', 'DOCKER-USER', '1', '-j', 'GHOSTLINE_LEASE'])

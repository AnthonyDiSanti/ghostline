#!/usr/bin/env python3
"""Opt-in disposable-host forwarding lease test; invoke from temporary diagnostics."""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, '/opt/ghostline')
import host_support as host


def probe(expect_blocked):
    # A real destination is checked before and after quarantine, distinguishing drops from absent listeners.
    try:
        with socket.create_connection(('1.1.1.1', 443), timeout=2):
            pass
    except TimeoutError:
        if expect_blocked:
            return
        raise
    if expect_blocked:
        raise RuntimeError('Forwarding bypassed the expired lease')


def verify():
    # Refuse to interrupt a maintained exit, even if this opt-in fixture is invoked accidentally.
    host.prepare_tools()
    config = host.configuration()
    if config['family'] != 'ghostline-lifecycle-test':
        raise RuntimeError('This fault fixture is restricted to the disposable lifecycle target')
    peers = host.diagnostic_peers(config)
    if set(peers) != {'xray', 'awg'}:
        raise RuntimeError('Expected both live engines')
    ids = host.command(['docker', 'ps', '--filter',
                        'label=com.amazonaws.ecs.task-definition-family=ghostline-lifecycle-test-network',
                        '--filter', 'label=com.amazonaws.ecs.container-name=network',
                        '--format', '{{.ID}}']).split()
    if len(ids) != 1:
        raise RuntimeError('Expected exactly one network daemon')
    daemon = ids[0]
    script = str(Path(__file__).resolve())
    pids = {name: host.command(['docker', 'inspect', '--format', '{{.State.Pid}}', peer['id']])
            for name, peer in peers.items()}

    def check(blocked):
        # Enter only each engine's network namespace; do not inspect its files or environment.
        for pid in pids.values():
            host.command(['nsenter', '--target', pid, '--net', '--', 'python3', script,
                          'blocked' if blocked else 'reachable'])

    check(False)
    try:
        # Freezing bypasses graceful cleanup, so only the kernel timeout can withdraw existing permission.
        host.command(['docker', 'pause', daemon])
        time.sleep(7)
        for peer in peers.values():
            result = subprocess.run(['ipset', 'test', 'GHOSTLINE_LIVE', peer['ip']],
                                    capture_output=True, check=False, timeout=3)
            if result.returncode != 1:
                raise RuntimeError('Forwarding lease did not expire')
        check(True)
    finally:
        host.command(['docker', 'unpause', daemon])
    time.sleep(3)
    check(False)
    # ECS must replace this exact daemon after hard death while leaving the gateway task in place.
    host.command(['docker', 'kill', '--signal', 'KILL', daemon])
    print(json.dumps({'expiredWithoutCleanup': True, 'bothEnginesBlocked': True,
                      'bothEnginesRecovered': True, 'killedDaemon': daemon}))


if __name__ == '__main__':
    if sys.argv[1:] == ['blocked']:
        probe(True)
    elif sys.argv[1:] == ['reachable']:
        probe(False)
    elif not sys.argv[1:]:
        verify()
    else:
        raise SystemExit('Unknown action')

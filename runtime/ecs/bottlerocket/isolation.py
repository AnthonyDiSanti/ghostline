#!/usr/bin/env python3
"""Prove bridge isolation against reachable listeners, without reading operational keys."""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

import host_support as host
import network

PORT = 24443


def listener():
    # A controlled listener distinguishes firewall isolation from an absent service.
    with socket.socket() as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(('0.0.0.0', PORT))
        server.listen()
        print('ready', flush=True)
        while True:
            client, _ = server.accept()
            client.close()


def blocked(address):
    # Timeout is required: a refused connection proves reachability, not isolation.
    try:
        with socket.create_connection((address, PORT), timeout=2):
            pass
    except TimeoutError:
        return
    raise RuntimeError('Expected firewall drop')


def reachable():
    # Probe inside the listener's namespace: host-originated return traffic is intentionally denied.
    with socket.create_connection(('127.0.0.1', PORT), timeout=2):
        pass


def verify():
    network.command = host.command
    host.prepare_tools()
    config = host.configuration()
    peers = host.diagnostic_peers(config)
    if set(peers) != {'xray', 'awg'}:
        raise RuntimeError('Expected both engines')
    script = str(Path(__file__).resolve())
    pids = {name: host.command(['docker', 'inspect', '--format', '{{.State.Pid}}', peer['id']])
            for name, peer in peers.items()}
    processes = []
    try:
        for prefix in [[], *[['nsenter', '--target', pid, '--net', '--'] for pid in pids.values()]]:
            processes.append(subprocess.Popen([*prefix, 'python3', script, 'listen'],
                                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        time.sleep(1)
        if any(process.poll() is not None for process in processes):
            raise RuntimeError('Isolation listener failed')
        reachable()
        for pid in pids.values():
            host.command(['nsenter', '--target', pid, '--net', '--', 'python3', script, 'reachable'])
        for name, pid in pids.items():
            other = peers['awg' if name == 'xray' else 'xray']['ip']
            for address in [config['awg'], '172.17.0.1', other]:
                result = subprocess.run(['nsenter', '--target', pid, '--net', '--', 'python3', script, 'blocked', address],
                                        capture_output=True, timeout=10)
                if result.returncode:
                    raise RuntimeError(f'Isolation failed: {name} to {address}')
        print(json.dumps({'hostBlocked': True, 'bridgeHostBlocked': True, 'peerBlocked': True}))
    finally:
        # The listeners share only network namespaces; terminate only the exact child processes we created.
        for process in processes:
            process.terminate()
        for process in processes:
            process.wait(timeout=5)


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'verify'
    if action == 'listen':
        listener()
    elif action == 'blocked':
        blocked(sys.argv[2])
    elif action == 'reachable':
        reachable()
    elif action == 'verify':
        verify()
    else:
        raise SystemExit('Unknown isolation action')

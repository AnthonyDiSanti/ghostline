#!/usr/bin/env python3
"""Prepare RAM and an empty kernel quarantine before Docker/ECS can restore engines."""
import os
import subprocess
import time
from pathlib import Path

import guard
import network
from host_support import STORAGE, command, configuration, prepare_tools

def prepare_storage(config):
    # Use Bottlerocket's native tmpfs label; bootstrap cannot relabel its filesystem superblock.
    if len(Path('/proc/swaps').read_text().splitlines()) != 1:
        raise RuntimeError('Host swap must be disabled')
    total = next(int(line.split()[1]) // 1024 for line in Path('/proc/meminfo').read_text().splitlines()
                 if line.startswith('MemTotal:'))
    if total < config['taskMemory'] + config['reservedMemory']:
        raise RuntimeError('Insufficient host memory')
    STORAGE.mkdir(parents=True, exist_ok=True, mode=0o700)
    mounted = subprocess.run(['mountpoint', '-q', str(STORAGE)], capture_output=True).returncode == 0
    if not mounted:
        command(['mount', '-t', 'tmpfs', '-o',
                 'size=2m,nosuid,nodev,noexec,mode=0700,uid=65532,gid=65532',
                 'ghostline-config', str(STORAGE)])
    if command(['stat', '-f', '-c', '%T', str(STORAGE)]) != 'tmpfs':
        raise RuntimeError('Configuration storage must be tmpfs')
    for name, mode in [('xray', 0o700), ('awg', 0o750)]:
        directory = STORAGE / name
        directory.mkdir(exist_ok=True)
        os.chown(directory, 65532, 65532)
        directory.chmod(mode)



def main():
    # The same immutable platform image supplies temporary diagnostics, never a persistent host controller.
    config = configuration()
    prepare_tools()
    if config['phase'] == 'diagnostic':
        print('Temporary platform diagnostics ready', flush=True)
        while True:
            time.sleep(60)
    if config['phase'] != 'bootstrap':
        raise RuntimeError('Unknown platform phase')
    if Path('/proc/sys/net/bridge/bridge-nf-call-iptables').read_text().strip() != '1':
        raise RuntimeError('Bridge firewall enforcement must be enabled')
    network.command = command
    prepare_storage(config)
    guard.install()
    print('RAM storage and empty forwarding quarantine ready', flush=True)


if __name__ == '__main__':
    main()

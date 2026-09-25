#!/usr/bin/env python3
"""Prepare RAM and an empty kernel quarantine before Docker/ECS can restore engines."""
import time
from pathlib import Path

from storage import prepare_storage
from boot_observation import observe_boot

import guard
import network
from host_support import command, configuration, prepare_tools

def main():
    # Only the finite bootstrap artifact supplies temporary diagnostics; the daemon is a separate image.
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
    observe_boot()
    print('RAM storage and empty forwarding quarantine ready', flush=True)


if __name__ == '__main__':
    main()

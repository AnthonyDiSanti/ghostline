#!/usr/bin/env python3
"""Install the same empty forwarding lease guard that the ECS daemon later renews."""
import guard
from pathlib import Path


def main():
    # A cold daemon needs no engine identities; an empty set blocks restored bridge traffic.
    guard.install()
    marker = Path('/run/ghostline')
    marker.mkdir(mode=0o700, exist_ok=True)
    (marker / 'quarantine-boot-id').write_text(Path('/proc/sys/kernel/random/boot_id').read_text())
    print('Ghostline early forwarding quarantine installed', flush=True)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Boot/diagnostic utilities; never imported by the restricted network daemon."""
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path('/.bottlerocket/rootfs')
STORAGE = ROOT / 'mnt/ghostline/config'

def command(args, data=None):
    # Only selected metadata leaves this process; commands that inspect keys never print their output.
    result = subprocess.run(args, input=data, text=True, capture_output=True, check=False)
    if result.returncode:
        # These platform tools receive only public networking/mount inputs, so their errors are diagnostic-safe.
        detail = result.stderr.strip()[:500] if args[0] in {'ip', 'ipset', 'iptables', 'iptables-restore', 'mount'} else 'details withheld'
        raise RuntimeError(f'{args[0]} {args[1] if len(args) > 1 else ""}: {detail}')
    return result.stdout.strip()


def configuration():
    # Host and bootstrap containers receive the same public topology, never application credentials.
    for kind in ('host-containers', 'bootstrap-containers'):
        path = Path(f'/.bottlerocket/{kind}/current/user-data')
        if path.exists():
            config = json.loads(path.read_text())
            config['interface'] = command(['ip', '-4', 'route', 'show', 'default']).split(' dev ')[1].split()[0]
            return config
    raise RuntimeError('Platform configuration missing')


def prepare_tools():
    # Use the same xtables backend as the host Docker daemon; never create an independent ruleset.
    # Inspect the host's packaged backend without executing its glibc binaries inside Alpine's musl userspace.
    target = (ROOT / 'usr/sbin/xtables').readlink().name
    if target not in {'xtables-nft-multi', 'xtables-legacy-multi'}:
        raise RuntimeError('Unknown host firewall backend')
    backend = 'nft' if target == 'xtables-nft-multi' else 'legacy'
    folder = Path('/run/ghostline-bin')
    folder.mkdir(exist_ok=True)
    for suffix in ('', '-save', '-restore'):
        link = folder / f'iptables{suffix}'
        if not link.exists():
            executable = shutil.which(f'iptables-{backend}{suffix}')
            if not executable:
                raise RuntimeError('Required firewall backend missing')
            link.symlink_to(executable)
    os.environ['PATH'] = f'{folder}:{os.environ["PATH"]}'
    os.environ['DOCKER_HOST'] = f'unix://{ROOT}/run/docker.sock'


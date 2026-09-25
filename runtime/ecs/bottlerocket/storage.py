#!/usr/bin/env python3
"""Finite boot-only private RAM preparation; no credentials or engine lifecycle work."""
import os
import stat
import subprocess
from pathlib import Path

from host_support import STORAGE, command

CAPACITY = 2 * 1024 * 1024


def validate_mount(kind, options, capacity, attributes):
    # Replaying bootstrap must reject an existing disk/bind mount or weakened tmpfs, not merely accept a path.
    required = {'rw', 'nosuid', 'nodev', 'noexec'}
    if kind != 'tmpfs' or not required.issubset(set(options.split(','))) or capacity != CAPACITY:
        raise RuntimeError('Configuration storage must be a restricted 2 MiB tmpfs')
    if (attributes.st_uid, attributes.st_gid, stat.S_IMODE(attributes.st_mode)) != (65532, 65532, 0o700):
        raise RuntimeError('Configuration storage ownership differs')


def prepare_storage(config):
    # Bottlerocket owns the native tmpfs SELinux label; never relabel its filesystem superblock.
    if len(Path('/proc/swaps').read_text().splitlines()) != 1:
        raise RuntimeError('Host swap must be disabled')
    total = next(int(line.split()[1]) // 1024 for line in Path('/proc/meminfo').read_text().splitlines()
                 if line.startswith('MemTotal:'))
    if total < config['taskMemory'] + config['reservedMemory']:
        raise RuntimeError('Insufficient host memory')
    if STORAGE.is_symlink():
        raise RuntimeError('Configuration storage cannot be a symbolic link')
    STORAGE.mkdir(parents=True, exist_ok=True, mode=0o700)
    if subprocess.run(['mountpoint', '-q', str(STORAGE)], capture_output=True).returncode != 0:
        command(['mount', '-t', 'tmpfs', '-o',
                 'size=2m,nosuid,nodev,noexec,mode=0700,uid=65532,gid=65532',
                 'ghostline-config', str(STORAGE)])
    kind, options = command(['findmnt', '-n', '-o', 'FSTYPE,OPTIONS', '--mountpoint', str(STORAGE)]).split()
    capacity = os.statvfs(STORAGE)
    validate_mount(kind, options, capacity.f_blocks * capacity.f_frsize, STORAGE.stat())
    for name, mode in [('xray', 0o700), ('awg', 0o750)]:
        directory = STORAGE / name
        if directory.is_symlink():
            raise RuntimeError('Protocol storage cannot be a symbolic link')
        directory.mkdir(exist_ok=True)
        os.chown(directory, 65532, 65532)
        directory.chmod(mode)

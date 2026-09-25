#!/usr/bin/env python3
"""Exercise rejection of unsafe existing boot mounts without requiring a privileged local mount."""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'runtime/ecs/bottlerocket'))
from storage import CAPACITY, validate_mount  # noqa: E402

owner = SimpleNamespace(st_uid=65532, st_gid=65532, st_mode=0o40700)
options = 'rw,nosuid,nodev,noexec,relatime,seclabel,size=2048k'
validate_mount('tmpfs', options, CAPACITY, owner)
for kind, flags, capacity, attributes in [
    ('ext4', options, CAPACITY, owner),
    ('tmpfs', options.replace(',noexec', ''), CAPACITY, owner),
    ('tmpfs', options.replace(',nodev', ''), CAPACITY, owner),
    ('tmpfs', options.replace(',nosuid', ''), CAPACITY, owner),
    ('tmpfs', options.replace('rw,', 'ro,'), CAPACITY, owner),
    ('tmpfs', options, CAPACITY * 2, owner),
    ('tmpfs', options, CAPACITY, SimpleNamespace(st_uid=0, st_gid=65532, st_mode=0o40700)),
    ('tmpfs', options, CAPACITY, SimpleNamespace(st_uid=65532, st_gid=65532, st_mode=0o40755)),
]:
    try:
        validate_mount(kind, flags, capacity, attributes)
    except RuntimeError:
        continue
    raise AssertionError('Unsafe configuration mount accepted')

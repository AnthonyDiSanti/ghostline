#!/usr/bin/env python3
"""Record the image actually bootstrapped, without making registry metadata a boot dependency."""
import json
import re
from pathlib import Path

from host_support import ROOT, command


def image_digest(container, listing):
    # Read our running container's image reference, then its local containerd descriptor; tags alone are not evidence.
    source = container.get('Image')
    matches = [line.split() for line in listing.splitlines() if line.split() and line.split()[0] == source]
    if len(matches) != 1 or len(matches[0]) < 3 or not re.fullmatch(r'sha256:[a-f0-9]{64}', matches[0][2]):
        raise RuntimeError('Bootstrap image descriptor is unavailable or ambiguous')
    return matches[0][2]


def record_boot():
    # Native bootstrap already has this host authority; neither engine nor the network daemon receives it.
    ctr = ['chroot', str(ROOT), '/usr/bin/ctr', '--address', '/run/host-containerd/containerd.sock', '--namespace', 'default']
    own = json.loads(command([*ctr, 'containers', 'info', 'boot.ghostline'], timeout=10))
    identity = image_digest(own, command([*ctr, 'images', 'list'], timeout=10))
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', boot):
        raise RuntimeError('Invalid kernel boot identity')
    os = json.loads(command(['apiclient', 'get', 'os'], timeout=10))['os']
    values = {'ghostline_bootstrap_digest': identity, 'ghostline_boot_id': boot,
              'ghostline_os_version': os['version_id'], 'ghostline_os_variant': os['variant_id'],
              'ghostline_os_arch': os['arch']}
    if any(not isinstance(v, str) or not re.fullmatch(r'[a-zA-Z0-9:._-]{1,128}', v) for v in values.values()):
        raise RuntimeError('Invalid bootstrap observation')
    # Agent registration publishes only these nonsecret values; preserve all unrelated instance attributes.
    command(['apiclient', 'set', *[f'settings.ecs.instance-attributes.{key}={value}' for key, value in values.items()]], timeout=15)
    print('Bootstrap identity and current boot recorded', flush=True)


def observe_boot():
    # Failed observation is visible but never prevents recovery once real RAM/quarantine prerequisites pass.
    try:
        record_boot()
    except Exception as error:
        print(f'Bootstrap observation unavailable: {type(error).__name__}; boot continues', flush=True)

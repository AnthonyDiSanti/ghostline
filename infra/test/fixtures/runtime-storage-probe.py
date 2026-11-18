#!/usr/bin/env python3
"""Inspect native runtime storage without returning secrets, raw files or credential hashes."""
import base64
import json
import os
import re
import stat
import subprocess
import sys
import urllib.request
from pathlib import Path

BUNDLES = ('GHOSTLINE_XRAY_BUNDLE', 'GHOSTLINE_AWG_BUNDLE', 'GHOSTLINE_DERP_BUNDLE')
ROOT = Path('/.bottlerocket/rootfs')
MAX_BYTES = 64 * 1024 * 1024
MAX_FILES = 500


def command(arguments):
    # Captured Docker output can contain credentials; never include it in exceptions.
    result = subprocess.run(arguments, capture_output=True, timeout=90, check=False)
    if result.returncode:
        raise RuntimeError('Storage probe operation failed; details withheld')
    return result.stdout


def variants(value):
    # Embedded base64 can begin at any three-byte alignment; exclude boundary-dependent symbols/padding.
    raw = value.encode()
    encoded = [base64.b64encode(b'\0' * offset + raw)[(offset * 8 + 5) // 6:((offset + len(raw)) * 8) // 6]
               for offset in range(3)]
    return tuple(set([raw, json.dumps(value, ensure_ascii=False)[1:-1].encode(), *encoded]))


def ram_values(directory):
    # Compare operational key material locally; paths, domains and the secret bytes never leave the host.
    values = {}
    def walk(value, selected):
        if isinstance(value, dict):
            for key, child in value.items():
                if key.lower() in {'privatekey', 'presharedkey', 'id'} and isinstance(child, str) and len(child) >= 16:
                    selected.add(child)
                else:
                    walk(child, selected)
        elif isinstance(value, list):
            for child in value:
                walk(child, selected)
    for name, filename in [('xray', 'server.json'), ('derp', 'derper.json')]:
        path = directory / name / filename
        if path.is_file():
            selected = set()
            walk(json.loads(path.read_text()), selected)
            values[name] = selected
    path = directory / 'awg/awg0.conf'
    if path.is_file():
        values['awg'] = set(re.findall(r'^(?:PrivateKey|PresharedKey)\s*=\s*(\S+)\s*$', path.read_text(), re.MULTILINE))
    for path in sorted((directory / 'derp').glob('*.key')):
        # Match both complete PEM and its base64 payload to cover common JSON/file encodings.
        value = path.read_text()
        values.setdefault('derp', set()).update([value, ''.join(line for line in value.splitlines() if not line.startswith('-----'))])
    return {name: selected for name, selected in values.items() if selected}


def task_credentials(family):
    # Read the current owned task's short-lived credentials only inside host RAM; return comparison counts, never values.
    ids = command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={family}-gateway',
                   '--filter', 'label=com.amazonaws.ecs.container-name=xray', '--format', '{{.ID}}']).decode().split()
    if len(ids) != 1:
        raise RuntimeError('Expected one serving task')
    entries = json.loads(command(['docker', 'inspect', '--format', '{{json .Config.Env}}', ids[0]]))
    environment = dict(entry.split('=', 1) for entry in entries)
    relative = environment.get('AWS_CONTAINER_CREDENTIALS_RELATIVE_URI')
    if relative is None:
        return {}
    if not re.fullmatch(r'/v2/credentials/[a-f0-9-]{36}', relative):
        raise RuntimeError('Unexpected task credential locator')
    # Never honor proxies or redirects for the local credential service.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, _request, _file, _code, _message, _headers, _url):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open('http://127.0.0.1:51679' + relative, timeout=3) as response:
        data = response.read(16385)
    if len(data) > 16384:
        raise RuntimeError('Oversized task credential response')
    document = json.loads(data)
    values = {}
    for field in ['AccessKeyId', 'SecretAccessKey', 'Token']:
        value = document.get(field)
        if not isinstance(value, str) or len(value) < 16:
            raise RuntimeError('Incomplete task credential comparison')
        values['task' + field] = {value}
    return values


def scan(directory, needles, max_bytes=MAX_BYTES, max_files=MAX_FILES):
    # A bounded negative result must expose incomplete coverage or files changing during inspection.
    report = {'filesScanned': 0, 'bytesScanned': 0, 'unreadable': 0, 'unstable': 0,
              'complete': True, 'matchedFiles': {name: 0 for name in needles}}
    if not directory.is_dir():
        return {**report, 'exists': False, 'complete': False}
    report['exists'] = True
    for parent, directories, filenames in os.walk(directory, followlinks=False):
        directories[:] = sorted(name for name in directories if not (Path(parent) / name).is_symlink())
        for name in sorted(filenames):
            path = Path(parent) / name
            try:
                before = path.lstat()
                if not stat.S_ISREG(before.st_mode):
                    continue
                if report['filesScanned'] >= max_files or report['bytesScanned'] + before.st_size > max_bytes:
                    report['complete'] = False
                    continue
                matched, tail = set(), b''
                longest = max((len(value) for values in needles.values() for value in values), default=1)
                with path.open('rb') as stream:
                    while True:
                        chunk = stream.read(min(1024 * 1024, max_bytes - report['bytesScanned'] + 1))
                        if not chunk:
                            break
                        report['bytesScanned'] += len(chunk)
                        if report['bytesScanned'] > max_bytes:
                            report['complete'] = False
                            break
                        data = tail + chunk
                        matched.update(key for key, values in needles.items() if any(value in data for value in values))
                        tail = data[-longest:]
                after = path.stat()
                if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                    report['unstable'] += 1
                    report['complete'] = False
                for key in matched:
                    report['matchedFiles'][key] += 1
                report['filesScanned'] += 1
            except OSError:
                report['unreadable'] += 1
                report['complete'] = False
    return report


def native(family):
    # Restrict inspection to Ghostline's initializer, not unrelated runtime container environments.
    if not family.startswith('ghostline-') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in family):
        raise RuntimeError('Invalid storage probe family')
    os.environ['DOCKER_HOST'] = f'unix://{ROOT}/run/docker.sock'
    ids = command(['docker', 'ps', '--all', '--filter', f'label=com.amazonaws.ecs.task-definition-family={family}-gateway',
                   '--filter', 'label=com.amazonaws.ecs.container-name=gateway-config', '--format', '{{.ID}}']).decode().split()
    if not ids or len(ids) > 4:
        raise RuntimeError('Expected a bounded set of Ghostline initializers')
    values = {name: set() for name in BUNDLES}
    for identifier in ids:
        for entry in json.loads(command(['docker', 'inspect', '--format', '{{json .Config.Env}}', identifier])):
            key, _, value = entry.partition('=')
            if key in values and value:
                values[key].add(value)
    sensitive = ram_values(ROOT / 'mnt/ghostline/config')
    temporary = task_credentials(family)
    needles = {key: tuple(set(item for value in selected for item in variants(value))) for key, selected in {**values, **sensitive, **temporary}.items() if selected}
    if not needles:
        raise RuntimeError('No operational key material is available for comparison')
    info = json.loads(command(['docker', 'info', '--format', '{{json .}}']))
    footprint = {}
    for name, path in [('docker', 'var/lib/docker'), ('containerd', 'var/lib/containerd'), ('ecs', 'var/lib/ecs')]:
        measured = command(['du', '-sk', str(ROOT / path)]).decode().split()[0]
        footprint[name] = int(measured)
    memory = {line.split(':')[0]: int(line.split()[1]) for line in (ROOT / 'proc/meminfo').read_text().splitlines()
              if line.startswith(('MemTotal:', 'MemAvailable:'))}
    return {'initializers': len(ids), 'nonemptyBundles': {key: bool(value) for key, value in values.items()},
            'ramKeyComparisons': {key: len(value) for key, value in sensitive.items()},
            'taskCredentialComparisons': {key: len(value) for key, value in temporary.items()},
            'docker': {'version': info['ServerVersion'], 'driver': info['Driver'], 'dataRoot': info['DockerRootDir']},
            'footprintKiB': footprint, 'memoryKiB': memory,
            'stores': {name: scan(ROOT / path, needles) for name, path in
                       [('dockerMetadata', 'var/lib/docker/containers'), ('ecsCheckpoint', 'var/lib/ecs/data'),
                        ('containerdMetadata', 'var/lib/containerd/io.containerd.metadata.v1.bolt'), ('ecsLogs', 'var/log/ecs')]}}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise RuntimeError('Expected the exact gateway family')
        print(json.dumps(native(sys.argv[1])))
    except Exception:
        raise SystemExit('Native storage probe failed; details withheld') from None

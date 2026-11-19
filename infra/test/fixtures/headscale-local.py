#!/usr/bin/env python3
"""Disposable synthetic ARM64 application qualification; never print keys or raw daemon logs."""
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid


def docker(arguments, checked=True):
    # Captured failures are summarized by phase; unfiltered container logs never enter qualification output.
    result = subprocess.run(['docker', *arguments], capture_output=True, text=True, check=False, timeout=120)
    if checked and result.returncode:
        raise RuntimeError('Local image command failed: ' + arguments[0])
    return result


def main():
    # A unique disposable Docker volume retains synthetic state across restart, then is always removed.
    image, helper, configuration = sys.argv[1:]
    token = uuid.uuid4().hex
    container, volume = 'ghostline-headscale-' + token, 'ghostline-headscale-state-' + token
    try:
        docker(['volume', 'create', volume])
        docker(['run', '--rm', '--network', 'none', '-v', volume + ':/state', '--entrypoint', 'chown', helper, '65532:65532', '/state'])
        docker(['run', '-d', '--name', container, '--platform', 'linux/arm64', '--network', 'none', '--read-only', '--user', '65532:65532',
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '512m',
                '--tmpfs', '/run/headscale:rw,nosuid,nodev,noexec,uid=65532,gid=65532,mode=0700',
                '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,uid=65532,gid=65532,mode=0700',
                '-v', str(Path(configuration).resolve()) + ':/etc/headscale:ro', '-v', volume + ':/var/lib/headscale', image, 'serve'])
        for _ in range(30):
            if docker(['exec', container, '/ko-app/headscale', 'health'], checked=False).returncode == 0:
                break
            time.sleep(1)
        else:
            # Only the controlled synthetic configuration is in scope; report error messages without raw log payloads.
            captured = docker(['logs', container], checked=False)
            logs = (captured.stdout + captured.stderr).splitlines()
            reasons = []
            for line in logs:
                try:
                    record = json.loads(line)
                    if record.get('level') in ('error', 'fatal'):
                        reasons.append(record.get('message', 'startup error'))
                except ValueError:
                    if line.startswith(('Error:', 'ERR ', 'FTL ')):
                        reasons.append(line)
            raise RuntimeError('Synthetic Headscale did not become healthy: ' + '; '.join(reasons)[:300])
        docker(['exec', container, '/ko-app/headscale', 'users', 'create', 'qualification', '--output', 'json'])

        def identity():
            # Hash the disposable key without copying or displaying it outside the temporary volume.
            return docker(['run', '--rm', '--network', 'none', '--read-only', '-v', volume + ':/state:ro',
                           '--entrypoint', 'sha256sum', helper, '/state/noise_private.key']).stdout.split()[0]

        before = identity()
        docker(['restart', container])
        for _ in range(30):
            if docker(['exec', container, '/ko-app/headscale', 'health'], checked=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Synthetic restart did not become healthy')
        users = json.loads(docker(['exec', container, '/ko-app/headscale', 'users', 'list', '--output', 'json']).stdout)
        if before != identity() or len(users) != 1 or users[0].get('name') != 'qualification':
            raise RuntimeError('Synthetic restart changed identity or lost registered state')
        # Check the unmodified image's normal lifecycle output without claiming coverage of fatal/TLS error paths.
        logs = docker(['logs', container])
        if logs.stdout or logs.stderr:
            raise RuntimeError('Synthetic normal lifecycle emitted daemon output')
        print(json.dumps({'healthy': True, 'restartIdentityPreserved': True, 'userPreserved': True, 'normalLogsEmpty': True}))
    finally:
        docker(['rm', '-f', container], checked=False)
        docker(['volume', 'rm', volume], checked=False)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Exercise the shipping proxy config with disposable TLS state and a real ARM64 Tailscale client."""
import json
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import uuid

CLIENT = 'tailscale/tailscale:v1.104.7'
HOST = 'coordinator.test'


def docker(*args, check=True):
    # Test identities and raw daemon output stay in this process.
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=90, check=False)
    if check and result.returncode:
        raise RuntimeError(f'Disposable TLS test failed during Docker {args[0]}')
    return result


def health(context, port):
    # Use the local CA and exact public SNI/Host behavior while keeping the backend unpublished.
    with socket.create_connection(('127.0.0.1', port), timeout=4) as connection:
        with context.wrap_socket(connection, server_hostname=HOST) as secured:
            secured.sendall(f'GET /health HTTP/1.1\r\nHost: {HOST}\r\nConnection: close\r\n\r\n'.encode())
            return secured.recv(1024).startswith(b'HTTP/1.1 200 ')


def quiet_probe(proxy, backend, context, port):
    # The baseline has reproduced address-bearing net/http stderr. Induce the same malformed TLS paths.
    def logs(container):
        result = docker('logs', container)
        return result.stdout, result.stderr
    before = [logs(proxy), logs(backend)]
    for packet in (b'GET /health HTTP/1.1\r\nHost: coordinator.test\r\n\r\n', b'not TLS\n'):
        with socket.create_connection(('127.0.0.1', port), timeout=4) as connection:
            connection.sendall(packet)
            try:
                connection.recv(512)
            except ConnectionResetError:
                pass
    with socket.create_connection(('127.0.0.1', port), timeout=4) as connection:
        try:
            context.wrap_socket(connection, server_hostname='wrong.test').close()
        except ssl.SSLError:
            pass
        else:
            raise RuntimeError('Unexpected TLS success for a wrong hostname')
    if not health(context, port) or before != [logs(proxy), logs(backend)]:
        raise RuntimeError('TLS failure changed gateway health or emitted daemon output')


def main():
    # Isolate backend/proxy and use only synthetic test keys on disposable volumes.
    upstream, caddy, helper, configuration = sys.argv[1:]
    base = 'ghostline-headscale-tls-' + uuid.uuid4().hex[:12]
    backend, proxy, client = (base + '-' + name for name in ('backend', 'proxy', 'client'))
    state, certs = base + '-state', base + '-certs'
    configuration = str(Path(configuration).resolve())
    docker('pull', '--platform', 'linux/arm64', CLIENT)
    try:
        docker('network', 'create', base)
        for volume in (state, certs):
            docker('volume', 'create', volume)
            docker('run', '--rm', '--network', 'none', '-v', volume + ':/data', '--entrypoint', 'chown', helper, '65532:65532', '/data')
        common = ['--platform', 'linux/arm64', '--network', base, '--read-only', '--user', '65532:65532',
                  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges']
        ram = ':rw,nosuid,nodev,noexec,uid=65532,gid=65532,mode=0700'
        docker('run', '-d', '--name', backend, *common, '--network-alias', 'headscale', '--memory', '512m',
               '--tmpfs', '/run/headscale'+ram, '--tmpfs', '/tmp'+ram,
               '-v', configuration+':/etc/headscale:ro', '-v', state+':/var/lib/headscale', upstream, 'serve')
        docker('run', '-d', '--name', proxy, *common, '--network-alias', HOST, '--memory', '128m',
               '-p', '127.0.0.1::8443', '--tmpfs', '/config'+ram, '--mount', 'type=volume,src='+certs+',dst=/data,volume-nocopy',
               '-v', configuration+'/Caddyfile:/etc/caddy/Caddyfile:ro', '--entrypoint', '/usr/bin/caddy', caddy,
               'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')

        with tempfile.TemporaryDirectory() as temporary:
            published = docker('port', proxy, '8443/tcp', check=False)
            if published.returncode:
                state_info = json.loads(docker('inspect', '--format', '{{json .State}}', proxy).stdout)
                raise RuntimeError('TLS proxy failed to publish its test listener: '+state_info['Status']+' / '+str(state_info['ExitCode']))
            port = int(published.stdout.strip().rsplit(':', 1)[1])
            ca = Path(temporary) / 'ca.pem'
            for _ in range(35):
                copy = docker('cp', proxy+':/data/pki/authorities/local/root.crt', str(ca), check=False)
                if copy.returncode == 0:
                    context = ssl.create_default_context(cafile=str(ca))
                    try:
                        if health(context, port):
                            break
                    except OSError:
                        pass
                time.sleep(1)
            else:
                raise RuntimeError('TLS proxy failed trusted local health')
            ca.chmod(0o644)
            quiet_probe(proxy, backend, context, port)

            user = json.loads(docker('exec', backend, '/ko-app/headscale', 'users', 'create', 'qualification', '-o', 'json').stdout)
            auth = json.loads(docker('exec', backend, '/ko-app/headscale', 'preauthkeys', 'create', '--user',
                                     str(user['id']), '--expiration', '5m', '-o', 'json').stdout)['key']
            docker('run', '-d', '--name', client, *common, '--tmpfs', '/state'+ram, '--tmpfs', '/tmp'+ram,
                   '-v', str(ca)+':/run/control-ca.pem:ro', '-e', 'SSL_CERT_FILE=/run/control-ca.pem',
                   '--entrypoint', 'tailscaled', CLIENT, '--tun=userspace-networking', '--statedir=/state',
                   '--socket=/state/tailscaled.sock', '--port=0')
            docker('exec', client, 'tailscale', '--socket=/state/tailscaled.sock', 'up', '--accept-dns=false',
                   '--login-server=https://'+HOST+':8443', '--auth-key='+auth, '--timeout=30s')
            status = json.loads(docker('exec', client, 'tailscale', '--socket=/state/tailscaled.sock', 'status', '--json').stdout)
            if status['BackendState'] != 'Running' or not status.get('TailscaleIPs'):
                raise RuntimeError('Tailscale did not enroll over the TLS-proxied control upgrade')
            docker('restart', proxy)
            # Docker may choose a new ephemeral host port across restart. The TLS identity must still verify.
            port = int(docker('port', proxy, '8443/tcp').stdout.strip().rsplit(':', 1)[1])
            for _ in range(25):
                try:
                    if health(context, port):
                        break
                except OSError:
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('Restart did not retain and serve the trusted CA')
            quiet_probe(proxy, backend, context, port)
        print(json.dumps({'trustedHealth': True, 'realTailscaleUpgrade': True, 'quietTlsFailures': True, 'tlsStateReused': True}))
    finally:
        docker('rm', '-f', client, proxy, backend, check=False)
        docker('volume', 'rm', state, certs, check=False)
        docker('network', 'rm', base, check=False)


if __name__ == '__main__':
    main()

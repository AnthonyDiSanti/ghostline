#!/usr/bin/env python3
"""Return fixed service diagnostics, never raw GuardDuty runtime events or log messages."""
import json
import os
from pathlib import Path
import re
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request


def main():
    # Agent files can hold encoded telemetry. Inspect service journal text instead, entirely on the host.
    unit = 'host-containers@amazon-guardduty-agent.service'
    prefix = ['nsenter', '--target', '1', '--mount', '--pid', '--']
    status = subprocess.run([*prefix, 'systemctl', 'show', unit, '--property=ActiveState',
                             '--property=SubState', '--property=ExecMainStatus'],
                            capture_output=True, text=True, check=True, timeout=15)
    journal = subprocess.run([*prefix, 'journalctl', '--unit', unit, '--boot', '--no-pager',
                              '--output=json', '--lines=100'],
                             capture_output=True, text=True, check=True, timeout=15)
    patterns = {
        'permissionDenied': r'access.?denied|permission.?denied|unauthori[sz]ed',
        'networkFailure': r'connection.?refused|timed?.?out|no.?route|network.?unreachable',
        'tlsFailure': r'x509|certificate.?verif|tls.?handshake',
        'credentialsFailure': r'credential.{0,40}(?:fail|error|missing|expired)',
        'errorOrFatal': r'\b(?:error|fatal)\b',
        'metadataMention': r'metadata|169\.254\.169\.254|imds',
        'telemetryMention': r'telemetry',
        'dnsFailure': r'no such host|name resolution|dns.{0,30}(?:fail|error)',
        'ipv6MetadataTimeout': r'(?m)^.*fd00:ec2::254.*(?:timeout|timed out|refused)',
        'ipv4MetadataTimeout': r'(?m)^.*169\.254\.169\.254.*(?:timeout|timed out|refused)',
        'anyFailure': r'\b(?:failed|failure|timeout)\b',
    }
    messages = [json.loads(line).get('MESSAGE', '') for line in journal.stdout.splitlines() if line.strip()]
    text = '\n'.join(message for message in messages if isinstance(message, str))
    counts = {key: len(re.findall(pattern, text, re.IGNORECASE)) for key, pattern in patterns.items()}
    states = dict(line.split('=', 1) for line in status.stdout.splitlines() if '=' in line)
    allowed = {'active', 'inactive', 'activating', 'deactivating', 'failed', 'running', 'exited', 'dead', 'start', 'stop'}
    service = {key: value if value in allowed or value.isdecimal() else 'other'
               for key, value in states.items()}

    # Probe only AWS telemetry. No addresses, responses, IMDS token or credentials leave this process.
    endpoint = sys.argv[1]
    if not re.fullmatch(r'guardduty-data\.[a-z0-9-]+\.amazonaws\.com', endpoint):
        raise ValueError('Expected the regional GuardDuty telemetry endpoint')
    network = {'resolved': False, 'tcpConnected': False, 'tlsVerified': False}
    try:
        socket.getaddrinfo(endpoint, 443, type=socket.SOCK_STREAM)
        network['resolved'] = True
        with socket.create_connection((endpoint, 443), timeout=5) as connection:
            network['tcpConnected'] = True
            with ssl.create_default_context().wrap_socket(connection, server_hostname=endpoint):
                network['tlsVerified'] = True
    except (OSError, ssl.SSLError):
        pass  # Fixed negative booleans are the intended diagnostic result.
    metadata_status = None
    try:
        urllib.request.urlopen('http://169.254.169.254/latest/meta-data/instance-id', timeout=3).close()
        metadata_status = 200
    except urllib.error.HTTPError as error:
        metadata_status = error.code
    except OSError:
        pass
    root = Path('/.bottlerocket/rootfs/var/log/amzn-guardduty-agent')
    # Hop-limit diagnosis needs namespace equality, never a metadata token or credential fetch.
    agent_namespaces = []
    for process in Path('/proc').iterdir():
        if not process.name.isdecimal():
            continue
        try:
            if process.joinpath('comm').read_text().strip().startswith('amzn-guardduty'):
                agent_namespaces.append({'sameNetworkAsHost': os.readlink(process / 'ns/net') == os.readlink('/proc/1/ns/net'),
                                         'sameNetworkAsDiagnostic': os.readlink(process / 'ns/net') == os.readlink('/proc/self/ns/net')})
        except (FileNotFoundError, ProcessLookupError):
            continue
    files = []
    for path in root.rglob('*'):
        if not path.is_file() or path.is_symlink():
            continue
        # Classify encoding before interpreting application logs; retain no raw message or event field.
        with path.open('rb') as stream:
            stream.seek(max(0, path.stat().st_size - 1024 * 1024))
            tail = stream.read()
        decoded = tail.decode('utf-8', errors='replace')
        vocabulary = ('metadata', 'register', 'heartbeat', 'connect', 'timeout', 'socket', 'endpoint',
                      'route', 'stream', 'ec2', 'retry', 'backoff', 'throttle', 'start', 'running',
                      'unsupported', 'tls', 'http', 'server', 'client', 'resolve', 'flush', 'netlink',
                      'receive', 'send', 'status', 'success', 'grpc', 'reset', 'resource', 'network',
                      'message', 'error', 'failed', 'configuration', 'duration', 'identity', 'invalid')
        contexts = [[word for word in vocabulary if word in line.lower()] for line in decoded.splitlines()
                    if re.search(patterns['networkFailure'], line, re.IGNORECASE)]
        records = []
        for line in decoded.splitlines():
            try:
                record = json.loads(line)
                if isinstance(record, dict):
                    records.append(record)
            except (ValueError, TypeError):
                continue
        levels = dict.fromkeys(('info', 'debug', 'warn', 'warning', 'error', 'fatal', 'other'), 0)
        for record in records:
            level = str(record.get('level', record.get('severity', 'other'))).lower()
            levels[level if level in levels else 'other'] += 1
        files.append({'name': path.name if re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', path.name) else 'other',
                      'bytes': path.stat().st_size, 'tailLines': len(decoded.splitlines()),
                      'utf8ReplacementCharacters': decoded.count('\ufffd'), 'jsonRecords': len(records), 'levels': levels,
                      'textSeverities': {level: len(re.findall(r'\b' + level + r'\b', decoded))
                                         for level in ('INFO', 'WARN', 'ERROR', 'DEBUG', 'TRACE', 'FATAL')},
                      'networkMentionVocabulary': contexts})
    print(json.dumps({'service': service, 'journalEntries': len(messages), 'journalCategories': counts,
                      'agentLogDirectoryExists': root.exists(), 'files': files,
                      'agentNamespaces': agent_namespaces,
                      'metadataHttpStatus': metadata_status, 'network': network}))


if __name__ == '__main__':
    main()

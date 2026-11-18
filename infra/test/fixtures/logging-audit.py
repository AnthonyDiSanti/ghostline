#!/usr/bin/env python3
"""Read bounded Ghostline logs locally; return counts/booleans, never raw values."""
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/.bottlerocket/rootfs')
NAMES = {'xray', 'awg', 'dns-policy', 'gateway-config', 'network'}


def summarize(text):
    # Counts prove sensitive record shapes without exporting IPs, questions, keys or example lines.
    lines = text.splitlines()
    public = private = access = dns = questions = credentials = 0
    for line in lines:
        addresses = []
        for value in re.findall(r'(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])', line):
            try:
                addresses.append(ipaddress.ip_address(value))
            except ValueError:
                continue
        public += int(any(a.is_global for a in addresses))
        private += int(any(not a.is_global for a in addresses))
        access += int(bool(re.search(r'\bfrom\b.*\b(?:accepted|rejected)\b', line)))
        dns += int('plugin/errors' in line)
        questions += int(bool(re.search(r'plugin/errors:\s+\d+\s+\S+\s+(?:A|AAAA|HTTPS|TXT|MX|PTR|SRV|NS|CNAME):', line)))
        credentials += int(bool(re.search(r'-----BEGIN .*PRIVATE KEY-----|(?:PrivateKey|PresharedKey|HeaderProtectionKey)\s*=\s*[A-Za-z0-9+/]{43}=', line)))
    return {'lineCount': len(lines), 'byteCount': len(text.encode()), 'publicIpLineCount': public,
            'nonGlobalIpLineCount': private, 'xrayAccessRecordCount': access,
            'dnsErrorRecordCount': dns, 'dnsQuestionRecordCount': questions, 'credentialPatternLineCount': credentials}


def secret_entries(entries):
    # Distinguish a retained variable name from a nonempty injected value, without returning that value.
    return sum(item.split('=', 1)[0] in {'GHOSTLINE_XRAY_BUNDLE', 'GHOSTLINE_AWG_BUNDLE'}
               and len(item.split('=', 1)) == 2 and bool(item.split('=', 1)[1]) for item in entries)


def run(args, include_stderr=False):
    # Never put captured stderr or subprocess arguments in a remote exception/SSM log.
    try:
        response = subprocess.run(args, capture_output=True, text=True, timeout=20,
                                  env={**os.environ, 'DOCKER_HOST': f'unix://{ROOT}/run/docker.sock'})
    except (subprocess.SubprocessError, OSError):
        raise RuntimeError('Read-only audit operation failed; details withheld') from None
    if response.returncode:
        raise RuntimeError('Read-only audit operation failed; details withheld')
    return response.stdout + (response.stderr if include_stderr else '')


def audit(family):
    # Exact ECS-family/container labels keep platform and unrelated application containers out of scope.
    if not re.fullmatch(r'ghostline-[a-z0-9-]+', family):
        raise ValueError('Invalid project family')
    records = []
    for suffix in ('-gateway', '-network', '-network-b'):
        ids = run(['docker', 'ps', '-a', '--filter', f'label=com.amazonaws.ecs.task-definition-family={family}{suffix}',
                   '--format', '{{.ID}}']).split()[:10]
        for identity in ids:
            metadata = json.loads(run(['docker', 'inspect', '--format',
                '{"name":{{json .Config.Labels}},"env":{{json .Config.Env}},"log":{{json .HostConfig.LogConfig}},"id":{{json .Id}}}', identity]))
            name = metadata['name'].get('com.amazonaws.ecs.container-name')
            if name not in NAMES:
                continue
            try:
                logs = run(['docker', 'logs', '--tail', '200', identity], include_stderr=True)
                summary = summarize(logs)
            except Exception:
                summary = {'readError': True}
            # Environment values stay on the host; expose only whether injected bundles remain in metadata.
            secret_env = secret_entries(metadata.get('env') or [])
            config = ROOT / 'var/lib/docker/containers' / metadata['id'] / 'config.v2.json'
            disk_secret = None
            filesystem = None
            if config.is_file():
                stored = json.loads(config.read_text())
                disk_secret = secret_entries(stored.get('Config', {}).get('Env', []))
                filesystem = run(['stat', '-f', '-c', '%T', str(config)]).strip()
                if filesystem not in {'tmpfs', 'ext2/ext3', 'xfs', 'overlayfs', 'btrfs'}:
                    filesystem = 'other'
            records.append({'container': name, 'logDriver': metadata.get('log', {}).get('Type'),
                            'sample': summary, 'secretEnvironmentCount': secret_env,
                            'persistedSecretEnvironmentCount': disk_secret, 'metadataFilesystem': filesystem})
    try:
        journal = run(['chroot', str(ROOT), '/usr/bin/journalctl', '--no-pager', '-o', 'json',
                       '-u', 'host-containers@amazon-guardduty-agent', '-n', '200'])
        messages = '\n'.join(str(json.loads(line).get('MESSAGE', '')) for line in journal.splitlines() if line.startswith('{'))
        agent = summarize(messages)
    except Exception as error:
        agent = {'readError': True, 'errorType': type(error).__name__}
    return {'containerLogSamples': records, 'guarddutyAgentDiagnosticSample': agent,
            'scope': 'Latest 200 retained lines per selected container/agent unit; no raw output returned'}


if __name__ == '__main__':
    try:
        print(json.dumps(audit(sys.argv[1])))
    except Exception:
        print(json.dumps({'readError': True, 'details': 'withheld'}))
        raise SystemExit(1) from None

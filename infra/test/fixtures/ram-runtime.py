#!/usr/bin/env python3
"""Exercise Option A locally; never connect this fixture to AWS or a remote Docker daemon."""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import tarfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

# This official build includes standalone containerd; 29.9.2 embeds it in dockerd.
DIND = 'docker:29.7.0-dind@sha256:084e385b0c9b7ab35d5a46dfedd033721448c000dbec71adcf13da8a9e71baa8'
WORKLOAD = 'busybox:1.37.0@sha256:a7dbc319b1438115a207e11930dc4bb3e643dcb3ec0bdd694bb36cd8fad289ec'
FIXTURES = Path(__file__).resolve().parent
LABEL = 'io.ghostline.ram-runtime'


class Probe:
    def __init__(self, output):
        # Unique ownership permits narrow cleanup without touching other worktrees.
        self.run_id = uuid.uuid4().hex[:12]
        self.output = output
        self.containers = []
        self.volumes = []
        self.context = ''
        self.workload_id = ''
        self.environment = {key: value for key, value in os.environ.items()
                            if key not in {'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'}}
        self.receipt = {'startedAt': self.now(), 'runId': self.run_id, 'cases': [], 'scope': 'local-synthetic-only'}

    @staticmethod
    def now():
        # Use UTC receipts so concurrent worktrees can correlate evidence reliably.
        return datetime.now(timezone.utc).isoformat()

    def command(self, arguments, data=None, check=True, timeout=120):
        # Never print command arguments or captured output: they can contain markers.
        result = subprocess.run(['docker', *(['--context', self.context] if self.context else []), *arguments],
                                input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=self.environment, timeout=timeout, check=False)
        if check and result.returncode:
            operation = arguments[0] if arguments else 'unknown'
            if '--host=unix:///run/stage1/docker.sock' in arguments:
                operation += '/' + arguments[arguments.index('--host=unix:///run/stage1/docker.sock') + 1]
            raise RuntimeError(f'Docker operation {operation} failed ({result.returncode}); raw output withheld')
        return result

    def inner(self, outer, arguments, data=None, check=True):
        # The nested daemon is reachable only through this exact local container.
        return self.command(['exec', '-i', outer, 'docker', '--host=unix:///run/stage1/docker.sock', *arguments],
                            data=data, check=check)

    def wait_ready(self, outer):
        # A bounded failure reports only fixed daemon diagnostics, never configuration.
        for _ in range(150):
            result = self.inner(outer, ['info', '--format', '{{json .}}'], check=False)
            if result.returncode == 0:
                return json.loads(result.stdout)
            time.sleep(0.2)
        raise RuntimeError('Nested daemon readiness deadline exceeded; raw diagnostics withheld')

    def scan(self, arguments, marker):
        # Search file bytes, including boundaries, without persisting tar output or values.
        process = subprocess.Popen(['docker', '--context', self.context, *arguments],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.environment)
        variants = [marker, base64.b64encode(marker), marker.hex().encode()]
        counts = {'docker': 0, 'containerd': 0, 'other': 0, 'filesScanned': 0,
                  'dockerConfigMarkerFiles': 0, 'containerdDatabaseMarkerFiles': 0}
        try:
            with tarfile.open(fileobj=process.stdout, mode='r|') as archive:
                for member in archive:
                    if not member.isfile():
                        continue
                    counts['filesScanned'] += 1
                    reader = archive.extractfile(member)
                    tail, matched = b'', False
                    while True:
                        chunk = reader.read(1024 * 1024)
                        if not chunk:
                            break
                        content = tail + chunk
                        matched = matched or any(value in content for value in variants)
                        tail = content[-max(map(len, variants)):]
                    if matched:
                        category = member.name.removeprefix('./').split('/')[0]
                        counts[category if category in {'docker', 'containerd'} else 'other'] += 1
                        if category == 'docker' and member.name.endswith('/config.v2.json'):
                            counts['dockerConfigMarkerFiles'] += 1
                        if category == 'containerd' and member.name.endswith('/meta.db'):
                            counts['containerdDatabaseMarkerFiles'] += 1
            diagnostic = process.stderr.read()
            if process.wait(timeout=30):
                reason = 'changed-file' if b'changed' in diagnostic else 'tar-error'
                raise RuntimeError(f'Persistence scan did not complete successfully ({reason})')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        return counts

    def scan_live(self, outer, marker):
        # Quiesce both roots; a changed-file error must not be mistaken for a clean scan.
        self.command(['exec', outer, '/ram-runtime-daemons.sh', 'pause'])
        try:
            return self.scan(['exec', outer, 'tar', '-C', '/state', '-cf', '-', '.'], marker)
        finally:
            self.command(['exec', outer, '/ram-runtime-daemons.sh', 'resume'])

    def scan_backing(self, volume, marker):
        # Read the actual backing volume after tmpfs mounts disappear, read-only.
        helper = f'ghostline-ram-{self.run_id}-scan-{len(self.containers)}'
        self.containers.append(helper)
        return self.scan(['run', '--name', helper, '--label', f'{LABEL}={self.run_id}',
                          '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                          # Overlay work directories have mode 000; read access must cover them too.
                          '--cap-add', 'DAC_READ_SEARCH',
                          '--security-opt', 'no-new-privileges', '--mount', f'type=volume,src={volume},dst=/state,readonly',
                          WORKLOAD, 'tar', '-C', '/state', '-cf', '-', '.'], marker)

    def create_outer(self, mode, missing_ram=False):
        # No host bind mounts, Docker socket, ports or network are exposed to DinD.
        name = f'ghostline-ram-{self.run_id}-{mode}' + ('-negative' if missing_ram else '')
        volume = f'{name}-state'
        self.command(['volume', 'create', '--label', f'{LABEL}={self.run_id}', volume])
        self.volumes.append(volume)
        options = ['create', '--name', name, '--label', f'{LABEL}={self.run_id}', '--privileged',
                   '--network', 'none', '--memory', '768m', '--memory-swap', '768m', '--log-driver', 'none',
                   '--mount', f'type=volume,src={volume},dst=/state',
                   '--tmpfs', '/tmp:rw,nosuid,size=16m',
                   '--env', 'DOCKER_TLS_CERTDIR=', '--entrypoint', '/usr/local/bin/dind']
        self.command([*options, DIND, '/ram-runtime-daemons.sh', 'run', mode,
                      'missing-ram' if missing_ram else 'prepare'])
        self.containers.append(name)
        self.command(['cp', str(FIXTURES / 'ram-runtime-daemons.sh'), f'{name}:/ram-runtime-daemons.sh'])
        self.command(['cp', str(FIXTURES / 'ram-runtime-workload.sh'), f'{name}:/ram-runtime-workload.sh'])
        self.command(['start', name])
        return name, volume

    def start_workload(self, outer, image_archive, marker):
        # The marker enters only the inner daemon; the outer Docker metadata has none.
        self.inner(outer, ['load'], data=image_archive)
        self.inner(outer, ['create', '--name', 'synthetic', '--network', 'none', '--read-only',
                           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                           '--mount', 'type=bind,src=/run/stage1/config,dst=/config',
                           '--mount', 'type=bind,src=/ram-runtime-workload.sh,dst=/probe.sh,readonly',
                           '--env', f'SYNTHETIC_SECRET={marker.decode()}', self.workload_id, 'sh', '/probe.sh'])
        self.inner(outer, ['start', 'synthetic'])
        if self.inner(outer, ['wait', 'synthetic']).stdout.strip() != b'0':
            raise RuntimeError('Synthetic initializer did not succeed')
        self.inner(outer, ['run', '--detach', '--name', 'reader', '--network', 'none', '--read-only',
                           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                           '--mount', 'type=bind,src=/run/stage1/config,dst=/config,readonly',
                           self.workload_id, 'sleep', '3600'])
        # A failed initializer must retain only fixed diagnostics, including its failure path.
        self.inner(outer, ['create', '--name', 'failed', '--network', 'none', '--read-only',
                           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                           '--mount', 'type=bind,src=/ram-runtime-workload.sh,dst=/probe.sh,readonly',
                           '--env', f'SYNTHETIC_SECRET={marker.decode()}', self.workload_id, 'sh', '/probe.sh', 'fail'])
        self.inner(outer, ['start', 'failed'])
        if self.inner(outer, ['wait', 'failed']).stdout.strip() != b'17':
            raise RuntimeError('Synthetic initializer failure did not execute')
        if self.inner(outer, ['logs', 'failed']).stdout != b'INITIALIZER_FAILED\n':
            raise RuntimeError('Failed initializer diagnostics were not fixed')
        # Keep one live positive control: exited-container Bolt pages may be reused nondeterministically.
        self.inner(outer, ['run', '--detach', '--name', 'metadata-control', '--network', 'none', '--read-only',
                           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                           '--env', f'SYNTHETIC_SECRET={marker.decode()}', self.workload_id, 'sleep', '3600'])
        self.check_workload(outer, marker)

    def check_workload(self, outer, marker):
        # Confirm both the environment record and rendered RAM file, emitting booleans only.
        config = json.loads(self.inner(outer, ['inspect', 'synthetic']).stdout)[0]
        if f'SYNTHETIC_SECRET={marker.decode()}' not in config['Config']['Env']:
            raise RuntimeError('Synthetic environment was not retained in container metadata')
        reader = json.loads(self.inner(outer, ['inspect', 'reader']).stdout)[0]
        mounts = [item for item in reader['Mounts'] if item['Destination'] == '/config']
        if len(mounts) != 1 or mounts[0]['RW'] or any(marker.decode() in item for item in reader['Config']['Env']):
            raise RuntimeError('Reader credential mount/environment isolation failed')
        for _ in range(50):
            rendered = self.inner(outer, ['exec', 'reader', 'cat', '/config/server.conf'], check=False)
            if rendered.returncode == 0 and rendered.stdout == marker:
                return
            time.sleep(0.1)
        raise RuntimeError('Synthetic RAM configuration did not become ready')

    def case(self, mode, image_archive):
        # Reuse no state across cases; the disk-backed control must demonstrate detectability.
        print(f'Running {mode}', flush=True)
        outer, volume = self.create_outer(mode)
        info = self.wait_ready(outer)
        swap = self.command(['exec', outer, 'cat', '/sys/fs/cgroup/memory.swap.max']).stdout.strip()
        if swap != b'0':
            raise RuntimeError('Synthetic runtime cgroup swap was not disabled')
        marker = f'SYNTHETIC_ONLY_{uuid.uuid4().hex}'.encode()
        self.start_workload(outer, image_archive, marker)
        live = self.scan_live(outer, marker)
        self.command(['exec', outer, '/ram-runtime-daemons.sh', 'restart-docker'])
        self.wait_ready(outer)
        self.check_workload(outer, marker)
        usage_lines = self.command(['exec', outer, 'du', '-sk', '/state/docker', '/state/containerd']).stdout.decode().splitlines()
        usage = {line.split()[1].split('/')[-1]: int(line.split()[0]) for line in usage_lines}
        peak = int(self.command(['exec', outer, 'cat', '/sys/fs/cgroup/memory.peak']).stdout)
        self.command(['stop', '--time', '15', outer])
        backing = self.scan_backing(volume, marker)
        outer_layer = self.scan(['export', outer], marker)
        if any(outer_layer[key] for key in ('docker', 'containerd', 'other')):
            raise RuntimeError('Synthetic marker escaped into the outer writable filesystem')
        if live['docker'] == 0:
            raise RuntimeError('Positive metadata control was not found by the scan')
        if mode == 'control' and backing['docker'] == 0:
            raise RuntimeError('Disk-backed persistence control did not detect the marker')
        if mode == 'docker-ram' and backing['containerdDatabaseMarkerFiles'] == 0:
            raise RuntimeError('Separate containerd persistence control did not detect the marker')
        if mode == 'all-ram' and any(backing[key] for key in ('docker', 'containerd', 'other')):
            raise RuntimeError('Synthetic marker reached the persistent backing volume')
        self.command(['start', outer])
        self.wait_ready(outer)
        listed = self.inner(outer, ['ps', '-a', '--format', '{{.Names}}']).stdout.decode().splitlines()
        empty_after_loss = listed == []
        if mode == 'all-ram':
            if not empty_after_loss:
                raise RuntimeError('RAM-loss simulation retained a stale container record')
            self.start_workload(outer, image_archive, marker)
        self.receipt['cases'].append({'mode': mode, 'dockerVersion': info['ServerVersion'],
                                      'driver': info['Driver'], 'liveMarkerFiles': live,
                                      'persistentMarkerFilesAfterStop': backing,
                                      'outerFilesystemMarkerFilesAfterStop': outer_layer,
                                      'dockerRestartPreservedConfiguration': True,
                                      'emptyAfterSimulatedRamLoss': empty_after_loss,
                                      'recreationAfterRamLoss': mode == 'all-ram',
                                      'readerReadOnlyAndWithoutSecretEnvironment': True,
                                      'fixedFailureOutput': True, 'cgroupSwapDisabled': True,
                                      'liveSecretMetadataPositiveControl': True,
                                      'outerRuntimePeakBytes': peak,
                                      'storeUsedKiB': usage})
        self.command(['stop', '--time', '15', outer])

    def preflight(self):
        # Reject remote endpoints and architecture drift before creating any test resources.
        self.context = self.command(['context', 'show']).stdout.decode().strip()
        context = json.loads(self.command(['context', 'inspect', self.context]).stdout)[0]
        endpoint = context['Endpoints']['docker']['Host']
        if not endpoint.startswith('unix://'):
            raise RuntimeError('This local-only experiment requires a Unix Docker endpoint')
        info = json.loads(self.command(['info', '--format', '{{json .}}']).stdout)
        if info['Architecture'] not in {'aarch64', 'arm64'} or info['OSType'] != 'linux':
            raise RuntimeError('This experiment requires a local ARM64 Linux Docker VM')
        images = [json.loads(self.command(['image', 'inspect', value]).stdout)[0] for value in (DIND, WORKLOAD)]
        if any(image['Architecture'] != 'arm64' for image in images):
            raise RuntimeError('Experiment image architecture mismatch')
        self.workload_id = images[1]['Id']
        self.receipt['host'] = {'context': self.context, 'localUnixEndpoint': True,
                                'dockerVersion': info['ServerVersion'], 'architecture': info['Architecture'],
                                'memoryMiB': info['MemTotal'] // 1024 // 1024}
        self.receipt['images'] = [image['Id'] for image in images]
        self.receipt['inputs'] = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                  for path in (Path(__file__), FIXTURES / 'ram-runtime-daemons.sh',
                                               FIXTURES / 'ram-runtime-workload.sh')}

    def cleanup(self):
        # Delete only exact names bearing this run's ownership label, including anonymous volumes.
        failures = []
        for kind, names in [('container', self.containers), ('volume', self.volumes)]:
            for name in reversed(names):
                inspected = self.command([kind, 'inspect', name], check=False)
                if inspected.returncode:
                    continue
                value = json.loads(inspected.stdout)[0]
                labels = value.get('Labels', {}) if kind == 'volume' else value['Config'].get('Labels', {})
                if labels.get(LABEL) != self.run_id:
                    failures.append('ownership-mismatch')
                    continue
                removed = self.command([kind, 'rm', *(['--force', '--volumes'] if kind == 'container' else []), name], check=False)
                if removed.returncode:
                    failures.append(f'{kind}-remove-failed')
        self.receipt['cleanup'] = {'passed': not failures, 'failures': failures}
        for kind in ('container', 'volume'):
            if self.command([kind, 'ls', *(['--all'] if kind == 'container' else []), '--quiet',
                             '--filter', f'label={LABEL}={self.run_id}']).stdout.strip():
                failures.append(f'{kind}-still-present')
        self.receipt['cleanup']['passed'] = not failures
        if failures:
            raise RuntimeError('Owned experiment resource cleanup failed')

    def run(self):
        # The receipt survives failures, but raw Docker errors and marker values never do.
        try:
            self.preflight()
            archive = self.command(['image', 'save', WORKLOAD]).stdout
            for mode in ('control', 'docker-ram', 'all-ram'):
                self.case(mode, archive)
            outer, volume = self.create_outer('all-ram', missing_ram=True)
            state = json.loads(self.command(['wait', outer]).stdout)
            if state != 42:
                raise RuntimeError('Missing RAM prerequisite did not fail closed')
            if self.scan_backing(volume, b'NO_SYNTHETIC_SECRET_DELIVERED')['filesScanned'] != 0:
                raise RuntimeError('A daemon wrote persistent files before RAM validation')
            self.receipt['missingRamFailsBeforeDaemonStart'] = True
            self.receipt['passed'] = True
        except Exception as error:
            self.receipt['passed'] = False
            self.receipt['failure'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
            raise
        finally:
            try:
                self.cleanup()
            finally:
                self.receipt['finishedAt'] = self.now()
                self.output.parent.mkdir(parents=True, exist_ok=True)
                self.output.write_text(json.dumps(self.receipt, indent=2) + '\n')


def main():
    # This integration gate is explicit and separate from the ordinary offline suite.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    probe = Probe(args.output.resolve())
    try:
        probe.run()
    except Exception:
        raise SystemExit(f'Local RAM runtime proof failed; inspect count-only receipt: {probe.output}') from None
    print(f'Local RAM runtime proof passed; count-only receipt: {probe.output}')


if __name__ == '__main__':
    main()

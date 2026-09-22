import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Remote = (command: string, expectedFailure?: boolean) => Promise<string>;

export async function withHostDiagnostics<T>(remote: Remote, operation: () => Promise<T>,
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))): Promise<T> {
  // Verification borrows authority briefly; startup and steady-state networking never need it.
  // A timed-out enable might still succeed remotely, so cleanup covers the enable operation too.
  try {
    await remote('apiclient set host-containers.ghostline-diagnostics.enabled=true');
    let ready = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      if ((await remote('apiclient exec ghostline-diagnostics -- echo ready', true)).trim() === 'ready') { ready = true; break; }
      await sleep(2000);
    }
    if (!ready) throw new Error('Temporary diagnostics did not start.');
    return await operation();
  } finally {
    await remote('apiclient set host-containers.ghostline-diagnostics.enabled=false');
    const containers = JSON.parse(await remote('apiclient get settings.host-containers')).settings['host-containers'];
    if (containers['ghostline-diagnostics']?.enabled !== false || containers.admin?.enabled !== false
      || containers.control?.superpowered !== false) throw new Error('Host administrative lockdown did not verify.');
  }
}

export function hostRemote(instance: string, work: string, aws: (args: string[]) => any): Remote {
  if (!/^i-[a-f0-9]+$/.test(instance)) throw new Error('Expected an active gateway host.');
  return async (command, expectedFailure = false) => {
    // Only maintained redacted diagnostics use this transport, never secret material or Docker dumps.
    const path = resolve(work, 'verify-command.json');
    writeFileSync(path, JSON.stringify({ commands: [command], executionTimeout: ['180'] }), { mode: 0o600 });
    const id = aws(['ssm', 'send-command', '--instance-ids', instance, '--document-name', 'AWS-RunShellScript',
      '--parameters', `file://${path}`]).Command.CommandId;
    for (let attempt = 0; attempt < 90; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const result = aws(['ssm', 'get-command-invocation', '--instance-id', instance, '--command-id', id]);
      if (result.Status === 'Success') return result.StandardOutputContent as string;
      if (['Failed', 'TimedOut', 'Cancelled'].includes(result.Status)) {
        if (expectedFailure && result.Status === 'Failed') return '';
        console.error(result.StandardErrorContent);
        throw new Error('Redacted host verification failed.');
      }
    }
    throw new Error('Host verification timed out.');
  };
}

export async function verifyHost(remote: Remote) {
  // Release diagnostic privilege before comparing credentials or waiting for GuardDuty reporting.
  return withHostDiagnostics(remote, async () => {
    if ((await remote('uname -m')).trim() !== 'aarch64') throw new Error('Unexpected host architecture.');
    const settings = JSON.parse(await remote('apiclient get settings.ecs')).settings.ecs;
    const evidence = JSON.parse(await remote('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/diagnostics.py'));
    const isolation = JSON.parse(await remote('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/isolation.py'));
    return { ...evidence, isolation, agentReservedMiB: settings['reserved-memory'] };
  });
}

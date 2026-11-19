import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coordinatorAws as aws, coordinatorRoot as root, runHeadscale } from '../../lib/headscale-operator.js';
import { headscaleNames } from '../../lib/headscale-config.js';
import { hostRemote, withHostDiagnostics } from '../../lib/ecs-verification.js';

const work = resolve(root, '.local/deployments/headscale');
const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

// Exercise real network namespaces with installed tools; never send IMDS requests that return credentials.
async function boundary(instance: string) {
  const execute = hostRemote(instance, work, args => aws(args));
  return withHostDiagnostics(execute, async () => {
    const prefix = 'apiclient exec ghostline-diagnostics -- ';
    const ids = (await execute(prefix + 'docker --host unix:///.bottlerocket/rootfs/run/docker.sock ps --filter label=com.amazonaws.ecs.task-definition-family=ghostline-headscale --format {{.ID}}')).trim().split(/\s+/);
    if (ids.length !== 1 || !/^[a-f0-9]+$/.test(ids[0]!)) throw new Error('Expected one coordinator container.');
    const pid = (await execute(prefix + `docker --host unix:///.bottlerocket/rootfs/run/docker.sock inspect --format {{.State.Pid}} ${ids[0]}`)).trim();
    if (!/^[1-9][0-9]*$/.test(pid)) throw new Error('Expected active coordinator process.');
    // A positive host control proves the metadata TCP listener exists before the app namespace is denied.
    await execute(prefix + 'nc -z -w 2 169.254.169.254 80');
    for (const address of ['169.254.169.254', '169.254.170.2', '172.17.0.1']) {
      const port = address === '172.17.0.1' ? 443 : 80;
      const result = await execute(prefix + `nsenter --target ${pid} --net -- nc -z -w 2 ${address} ${port} && echo reachable || echo blocked`);
      if (result.trim() !== 'blocked') throw new Error('Coordinator reached a protected host/private endpoint.');
    }
    // Entering only the network namespace retains the helper's resolver file; use an IP for the public TCP control.
    await execute(prefix + `nsenter --target ${pid} --net -- nc -z -w 5 1.1.1.1 443`);
    return { metadataBlocked: true, hostBlocked: true, publicHttpsReachable: true };
  });
}

const action = process.argv[2];
if (action === 'boundary') {
  const current = await runHeadscale('status', []) as { instance: string };
  const evidence = await boundary(current.instance);
  writeFileSync(resolve(work, 'network-boundary.json'), JSON.stringify(evidence), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} else if (action === 'reboot') {
  // Observe the actual kernel boot identity, then use normal EC2 reboot; no custom bootstrap retry controller.
  const before = await runHeadscale('status', []) as { instance: string };
  const execute = hostRemote(before.instance, work, args => aws(args));
  const boot = (await execute('cat /proc/sys/kernel/random/boot_id')).trim();
  const identity = JSON.parse(readFileSync(resolve(work, 'verification.json'), 'utf8'));
  aws(['ec2', 'reboot-instances', '--instance-ids', before.instance]);
  await wait(30_000);
  let changed = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await execute('cat /proc/sys/kernel/random/boot_id')).trim() !== boot) { changed = true; break; } } catch { /* SSM disconnect is expected during reboot. */ }
    await wait(5000);
  }
  if (!changed) throw new Error('Coordinator reboot was not observed.');
  const after = await runHeadscale('verify', []) as { noiseSha256: string };
  if (after.noiseSha256 !== identity.noiseSha256) throw new Error('Reboot changed coordinator identity.');
  writeFileSync(resolve(work, 'reboot-qualification.json'), JSON.stringify({ rebooted: true, identityPreserved: true, instance: before.instance }), { mode: 0o600 });
  console.log('Coordinator reboot and identity persistence passed.');
} else {
  throw new Error(`Usage: node --import=tsx test/fixtures/headscale-native.ts <boundary|reboot>; cluster ${headscaleNames.cluster}`);
}

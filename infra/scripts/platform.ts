import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDeployment } from '../lib/config.js';
import { withLifecycle } from '../lib/lifecycle-operator.js';
import { operatorGate, command, verifyAccount, root } from '../lib/releases/operator.js';
import { nativeQualificationPath, qualifyNativePlatform } from '../lib/platform-qualification.js';
import { imageArtifacts, releaseTag } from '../lib/ecs-release.js';
import { updateHostOs } from '../lib/platform-update.js';

const [target, action, path, ...extra] = process.argv.slice(2);
if (extra.length || !['status', 'update', 'qualify'].includes(action ?? '') || (action === 'qualify' ? !path : !!path)) {
  throw new Error('Usage: npm run platform <target> <status|update|qualify qualified-file>.');
}
const config = getDeployment(target);
verifyAccount();
if (action === 'update') await updateHostOs(config);
else {
  const run = async () => {
    const gate = operatorGate(config.id);
    // Observation may span SSM invocations; never replace current boot evidence with registration-time ECS attributes.
    let ready = false;
    for (let n = 0; n < 30; n++) {
      if (await gate.refresh() === 'ready') { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (!ready) throw new Error('Host observation remains pending.');
    const actual = await gate.observe();
    if (action === 'status') { console.log(JSON.stringify(actual, null, 2)); return; }
    const qualified = JSON.parse(readFileSync(resolve(path!), 'utf8'));
    if (!Number.isFinite(Date.parse(qualified.qualifiedAt)) || Object.keys(qualified.images ?? {}).length !== imageArtifacts.length
      || imageArtifacts.some(name => qualified.images[name]?.buildTag !== releaseTag(name))) throw new Error('Build qualification differs from current source inputs.');
    // This command closes central native qualification after the documented isolated lifecycle experiment, never a regional delivery gate.
    command(process.execPath, ['--import=tsx', 'scripts/ecs.ts', config.id, 'verify'], undefined, true);
    const proof = qualifyNativePlatform(qualified.images, actual, new Date().toISOString());
    writeFileSync(nativeQualificationPath, JSON.stringify(proof, null, 2) + '\n');
    writeFileSync(resolve(path!), JSON.stringify({ ...qualified, os: proof.os }, null, 2) + '\n', { mode: 0o600 });
    console.log(`Native compatibility recorded for ${proof.os.variant}/${proof.os.architecture} ${proof.os.compatibleVersions.join(', ')} in ${root}/infra/platform-qualification.json.`);
  };
  if (action === 'qualify') await withLifecycle(config, 'platform-qualify', run);
  else await run();
}

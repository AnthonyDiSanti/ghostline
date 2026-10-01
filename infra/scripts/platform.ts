import { assertBenchmarkExclusion } from '../lib/benchmark/exclusion.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDeployment } from '../lib/config.js';
import { withLifecycle } from '../lib/lifecycle-operator.js';
import { operatorGate, command, verifyAccount, root } from '../lib/releases/operator.js';
import { nativeQualificationPath, qualifyNativePlatform } from '../lib/platform-qualification.js';
import { imageArtifacts, releaseTag } from '../lib/ecs-release.js';
import { qualificationObservation } from '../lib/releases/generation-proof.js';

assertBenchmarkExclusion();
const [target, action, path, ...extra] = process.argv.slice(2);
if (extra.length || !['status', 'qualify'].includes(action ?? '') || (action === 'qualify' ? !path : !!path)) {
  throw new Error('Usage: npm run platform <target> <status|qualify qualified-file>.');
}
const config = getDeployment(target);
verifyAccount();
{
  const run = async () => {
    const gate = await operatorGate(config.id);
    const lifecycle = await gate.record<{ mode: string }>('lifecycle');
    if (lifecycle?.mode !== 'active') {
      if (action === 'qualify') throw new Error('Native qualification requires a running region.');
      console.log(JSON.stringify({ lifecycle, retainedImages: await gate.record('runtime/images') }, null, 2)); return;
    }
    let generation;
    for (let n = 0; n < 30; n++) {
      generation = await gate.generation();
      if (generation) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (!generation) throw new Error('Fresh generation observation remains pending.');
    if (action === 'status') { console.log(JSON.stringify(generation, null, 2)); return; }
    const actual = qualificationObservation(generation);
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

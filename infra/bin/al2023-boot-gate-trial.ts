import { App } from 'aws-cdk-lib';
import { getDeployment } from '../lib/config.js';
import { Al2023BootGateTrialStack, al2023GateTrialName } from '../lib/al2023-boot-gate-stack.js';

// This isolated probe never selects a production stack or regional client credentials.
const region = getDeployment('lifecycle-test');
const app = new App();
const phase = app.node.tryGetContext('phase');
const derivedAmi = app.node.tryGetContext('derivedAmi');
if (phase !== 'builder' && phase !== 'derived') throw new Error('Set -c phase=builder or -c phase=derived.');
if (phase === 'derived' && typeof derivedAmi !== 'string') throw new Error('Derived trial requires -c derivedAmi=ami-...');
// Public AWS ARM64 OCI identity observed locally; this is only the disposable systemd gate probe.
const probeImage = 'public.ecr.aws/amazonlinux/amazonlinux@sha256:06da5a3362eda00c5114227ac81abe56dd9b943395553b7c64a310457f4d9e2b';
new Al2023BootGateTrialStack(app, al2023GateTrialName, {
  env: { account: region.account, region: region.region }, availabilityZone: region.availabilityZone,
  bootstrapImage: probeImage, host: phase === 'builder' ? { phase } : { phase, imageId: derivedAmi },
});

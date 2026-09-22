import { readFileSync } from 'node:fs';
import { bottlerocketConfig, buildBottlerocketRepository, buildBottlerocketTrial, type BottlerocketTrial } from '../lib/bottlerocket.js';
import { guardDutyForDeployment } from '../lib/guardduty-discovery.js';

// An explicit experimental entrypoint prevents normal regional deployment/release commands from selecting it.
if (process.env.GHOSTLINE_BOTTLEROCKET_COMPONENT === 'repository') {
  buildBottlerocketRepository();
} else {
  const trial: BottlerocketTrial = JSON.parse(readFileSync(new URL('../../.local/bottlerocket/trial.json', import.meta.url), 'utf8'));
  const lifecycle = process.env.GHOSTLINE_LIFECYCLE ?? 'active';
  if (lifecycle !== 'active' && lifecycle !== 'parked') throw new Error('Invalid trial lifecycle.');
  buildBottlerocketTrial(trial, lifecycle === 'parked' ? { service: false, runtime: false } : guardDutyForDeployment(bottlerocketConfig(trial.amiId)), undefined, lifecycle);
}

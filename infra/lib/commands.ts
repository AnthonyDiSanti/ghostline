import { resolve } from 'node:path';
import { getDeployment } from './config.js';

export function deploymentCommand(action: string, target: string | undefined, infraDir: string) {
  // A command owns exactly one stack and one output directory; caller flags cannot widen scope.
  if (!['synth', 'diff', 'deploy'].includes(action)) throw new Error('Unsupported CDK action.');
  const config = getDeployment(target);
  const artifactDir = resolve(infraDir, '../.local/deployments', config.id);
  const args = [action, config.stackName, '--profile', 'personal', '--region', config.region,
    '--output', resolve(artifactDir, 'cdk.out')];
  if (action === 'deploy') args.push('--outputs-file', resolve(artifactDir, 'outputs.json'));
  return { config, artifactDir, args };
}

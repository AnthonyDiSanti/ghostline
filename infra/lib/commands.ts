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

export function ecsDeploymentCommand(action: 'diff' | 'deploy', target: string, infraDir: string, images = false) {
  // Keep cold rebuilds noninteractive and restrict them to a named ECS target.
  const config = getDeployment(target);
  if (!config.ecs) throw new Error('Select an ECS deployment.');
  const artifactDir = resolve(infraDir, '../.local/deployments', config.id, 'ecs');
  const args = [action, `${config.stackName}${images ? 'Images' : ''}`, '--profile', 'personal',
    '--region', config.region, '--output', resolve(artifactDir, 'cdk.out')];
  if (action === 'deploy') args.push('--require-approval', 'never');
  return { config, artifactDir, args };
}

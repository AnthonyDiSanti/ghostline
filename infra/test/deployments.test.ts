import { describe, expect, it } from 'vitest';
import { deploymentIds, getDeployment, validateDeployment } from '../lib/config.js';
import { deploymentCommand, ecsDeploymentCommand } from '../lib/commands.js';

describe('regional gateway configuration', () => {
  it('exposes only maintained endpoints and preserves Stockholm cloud identities', () => {
    expect(deploymentIds).toEqual(['stockholm-ecs', 'cape-town']);
    expect(getDeployment('stockholm-ecs')).toMatchObject({ region: 'eu-north-1', availabilityZone: 'eu-north-1a',
      stackName: 'GhostlineEcsTrial', resourceName: 'ghostline-ecs-stockholm', instanceType: 't4g.small' });
  });
  it.each([undefined, '', 'unknown', '../stockholm-ecs', '--all', 'toString'])('rejects ambiguous target %s', target => {
    expect(() => getDeployment(target)).toThrow('Select a deployment');
  });
  it('rejects wrong-region zones, unsupported hosts and unknown configuration modes', () => {
    const config = getDeployment('stockholm-ecs');
    expect(() => validateDeployment({ ...config, availabilityZone: 'eu-central-1a' })).toThrow('matching region');
    expect(() => validateDeployment({ ...config, instanceType: 't3.small' })).toThrow('t4g');
    expect(() => validateDeployment({ ...config, rootVolumeGiB: 20 })).toThrow('30 GiB');
    expect(() => validateDeployment({ ...config, alternateRuntime: true } as any)).toThrow('Unknown deployment');
  });
  it('scopes output paths and stack selection to one explicit target', () => {
    const command = deploymentCommand('deploy', 'stockholm-ecs', '/repo/infra');
    expect(command.args).toEqual(['deploy', 'GhostlineEcsTrial', '--profile', 'personal', '--region', 'eu-north-1',
      '--output', '/repo/.local/deployments/stockholm-ecs/cdk.out',
      '--outputs-file', '/repo/.local/deployments/stockholm-ecs/outputs.json']);
    expect(() => deploymentCommand('destroy', 'stockholm-ecs', '/repo/infra')).toThrow('Unsupported');
  });
  it('keeps image and endpoint deployment scopes explicit and unattended', () => {
    // A cold rebuild must not strand an endpoint waiting for an unavailable terminal.
    for (const images of [false, true]) {
      const command = ecsDeploymentCommand('deploy', 'stockholm-ecs', '/repo/infra', images);
      expect(command.args.slice(0, 2)).toEqual(['deploy', images ? 'GhostlineEcsTrialImages' : 'GhostlineEcsTrial']);
      expect(command.args.slice(-2)).toEqual(['--require-approval', 'never']);
      expect(command.args).not.toContain('--all');
    }
    expect(ecsDeploymentCommand('diff', 'stockholm-ecs', '/repo/infra').args).not.toContain('--require-approval');
    expect(() => ecsDeploymentCommand('deploy', '--all', '/repo/infra')).toThrow('Select a deployment');
  });
});

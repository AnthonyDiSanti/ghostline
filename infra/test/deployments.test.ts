import { describe, expect, it } from 'vitest';
import { deploymentIds, getDeployment, validateDeployment } from '../lib/config.js';
import { deploymentCommand, ecsDeploymentCommand } from '../lib/commands.js';

describe('independent deployment targets', () => {
  it('preserves the deployed Frankfurt identity and pinned image', () => {
    expect(getDeployment('frankfurt')).toMatchObject({
      region: 'eu-central-1', availabilityZone: 'eu-central-1a', amiId: 'ami-03f92a7a8a26c81af',
      stackName: 'GhostlinePoc', resourceName: 'ghostline-poc',
    });
  });
  it('keeps regional stack and key identities distinct across the catalog', () => {
    const configs = deploymentIds.map(getDeployment);
    expect(new Set(configs.map(c => `${c.account}/${c.region}/${c.stackName}`)).size).toBe(configs.length);
    expect(new Set(configs.map(c => `${c.account}/${c.region}/${c.resourceName}`)).size).toBe(configs.length);
  });
  it.each([undefined, '', 'unknown', '../frankfurt', '--all', 'toString'])('rejects ambiguous target %s', (target) => {
    expect(() => getDeployment(target)).toThrow('Select a deployment');
  });
  it('rejects cross-region AZ input instead of consulting ambient AWS defaults', () => {
    expect(() => validateDeployment({ ...getDeployment('cape-town'), availabilityZone: 'eu-central-1a' })).toThrow('matching region');
  });
  it('isolates synthesis and output files while selecting exactly one regional stack', () => {
    const frankfurt = deploymentCommand('deploy', 'frankfurt', '/repo/infra');
    const capeTown = deploymentCommand('deploy', 'cape-town', '/repo/infra');
    expect(capeTown.args).toEqual(['deploy', 'GhostlinePoc', '--profile', 'personal', '--region', 'af-south-1',
      '--output', '/repo/.local/deployments/cape-town/cdk.out',
      '--outputs-file', '/repo/.local/deployments/cape-town/outputs.json']);
    expect(frankfurt.artifactDir).not.toBe(capeTown.artifactDir);
    expect(capeTown.args).not.toContain('--all');
  });
  it('does not turn this helper into an implicit deletion or approval bypass', () => {
    expect(() => deploymentCommand('destroy', 'cape-town', '/repo/infra')).toThrow('Unsupported');
    expect(deploymentCommand('deploy', 'cape-town', '/repo/infra').args).not.toContain('--require-approval');
  });
  it('permits unattended ECS rebuilds only through an explicitly scoped ECS command', () => {
    // A missing terminal must not strand a parked endpoint at the IAM recreation prompt.
    for (const images of [false, true]) {
      const command = ecsDeploymentCommand('deploy', 'stockholm-ecs', '/repo/infra', images);
      expect(command.args.slice(0, 2)).toEqual(['deploy', images ? 'GhostlineEcsTrialImages' : 'GhostlineEcsTrial']);
      expect(command.args).toContain('eu-north-1');
      expect(command.args.slice(-2)).toEqual(['--require-approval', 'never']);
      expect(command.args).not.toContain('--all');
    }
    expect(ecsDeploymentCommand('diff', 'stockholm-ecs', '/repo/infra').args).not.toContain('--require-approval');
    expect(() => ecsDeploymentCommand('deploy', 'stockholm', '/repo/infra')).toThrow('ECS deployment');
    expect(() => ecsDeploymentCommand('deploy', '--all', '/repo/infra')).toThrow('Select a deployment');
  });
});

import { describe, expect, it } from 'vitest';
import { deploymentIds, getDeployment, validateDeployment } from '../lib/config.js';
import { deploymentCommand, ecsDeploymentCommand } from '../lib/commands.js';

describe('regional gateway configuration', () => {
  it('exposes only maintained endpoints and preserves Stockholm cloud identities', () => {
    // Regional enrollment preserves every existing endpoint's stable cloud identity.
    expect(deploymentIds).toEqual(['stockholm-ecs', 'oregon', 'zurich', 'cape-town', 'nva']);
    expect(getDeployment('stockholm-ecs')).toMatchObject({ region: 'eu-north-1', availabilityZone: 'eu-north-1a',
      stackName: 'GhostlineEcsTrial', resourceName: 'ghostline-ecs-stockholm', instanceType: 't4g.small' });
    expect(getDeployment('oregon')).toMatchObject({ region: 'us-west-2', availabilityZone: 'us-west-2a',
      stackName: 'GhostlineOregon', resourceName: 'ghostline-oregon', instanceType: 't4g.small', dnsRequired: true });
    expect(getDeployment('zurich')).toMatchObject({ region: 'eu-central-2', availabilityZone: 'eu-central-2a',
      stackName: 'GhostlineZurich', resourceName: 'ghostline-zurich', instanceType: 't4g.small', dnsRequired: true });
    expect(getDeployment('nva')).toMatchObject({ region: 'us-east-1', availabilityZone: 'us-east-1a',
      stackName: 'GhostlineNva', resourceName: 'ghostline-nva', instanceType: 't4g.small', dnsRequired: true });
  });
  it.each([undefined, '', 'unknown', '../stockholm-ecs', '--all', 'toString'])('rejects ambiguous target %s', target => {
    expect(() => getDeployment(target)).toThrow('Select a deployment');
  });
  it('rejects wrong-region zones, unsupported hosts and unknown configuration modes', () => {
    const config = getDeployment('stockholm-ecs');
    expect(() => validateDeployment({ ...config, availabilityZone: 'eu-central-1a' })).toThrow('matching region');
    expect(() => validateDeployment({ ...config, instanceType: 't3.small' })).toThrow('t4g');
    expect(() => validateDeployment({ ...config, dataVolumeGiB: 20 })).toThrow('30 GiB');
    expect(() => validateDeployment({ ...config, dnsRequired: 'yes' } as any)).toThrow('boolean');
    expect(validateDeployment({ ...config, dnsRequired: true }).dnsRequired).toBe(true);
    expect(validateDeployment({ ...config, parameterPrefix: '/ghostline/trial/dns-native' }).parameterPrefix)
      .toBe('/ghostline/trial/dns-native');
    for (const parameterPrefix of ['/ghostline/prod/server', '/ghostline/trial/../prod', '/other/trial', '/ghostline/trial/']) {
      expect(() => validateDeployment({ ...config, parameterPrefix })).toThrow('Invalid credential parameter prefix');
    }
    expect(() => validateDeployment({ ...config, alternateRuntime: true } as any)).toThrow('Unknown deployment');
  });
  it('scopes output paths and stack selection to one explicit target', () => {
    const command = deploymentCommand('deploy', 'stockholm-ecs', '/repo/infra');
    expect(command.args).toEqual(['deploy', 'GhostlineEcsTrial', '--profile', 'personal', '--region', 'eu-north-1',
      '--output', '/repo/.local/deployments/stockholm-ecs/cdk.out',
      '--outputs-file', '/repo/.local/deployments/stockholm-ecs/outputs.json']);
    expect(deploymentCommand('diff', 'stockholm-ecs', '/repo/infra').args.slice(-2)).toEqual(['--method', 'template']);
    expect(() => deploymentCommand('destroy', 'stockholm-ecs', '/repo/infra')).toThrow('Unsupported');
  });
  it('keeps endpoint deployment scope explicit and unattended', () => {
    // A cold rebuild must not strand an endpoint waiting for an unavailable terminal.
    {
      const command = ecsDeploymentCommand('deploy', 'stockholm-ecs', '/repo/infra');
      expect(command.args.slice(0, 2)).toEqual(['deploy', 'GhostlineEcsTrial']);
      expect(command.args.slice(-2)).toEqual(['--require-approval', 'never']);
      expect(command.args).not.toContain('--all');
    }
    const diff = ecsDeploymentCommand('diff', 'stockholm-ecs', '/repo/infra').args;
    expect(diff).not.toContain('--require-approval');
    expect(diff.slice(-2)).toEqual(['--method', 'template']);
    expect(() => ecsDeploymentCommand('deploy', '--all', '/repo/infra')).toThrow('Select a deployment');
  });
});

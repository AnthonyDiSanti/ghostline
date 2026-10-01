import { expect, it } from 'vitest';
import { activationHook } from '../lib/releases/activation-hook.js';
import type { AwsBlueGreen } from '../lib/releases/aws-blue-green.js';
import type { DeploymentHook } from '../lib/releases/deployment-hook.js';
import type { LifecycleState } from '../lib/releases/lifecycle.js';

function fixture() {
  const service = 'arn:aws:ecs:eu-west-1:000000000000:service/cluster/gateway';
  const deployment = service.replace(':service/', ':service-deployment/') + '/current';
  const hook: DeploymentHook = { resourceArn: deployment, executionId: 'execution', lifecycleStage: 'PRE_SCALE_UP',
    executionDetails: { serviceArn: service, targetServiceRevisionArn: 'revision', productionTrafficWeights: {} } };
  const lifecycle: LifecycleState = { version: 1, mode: 'active', operation: { kind: 'deploy', owner: 'operator', startedAt: 1000 } };
  let desired = 0, badIdentity = false;
  const calls: string[] = [];
  const gate = { config: { account: '000000000000', region: 'eu-west-1', cluster: 'cluster', service: 'gateway' },
    record: async () => undefined,
    clients: { ecs: { send: async (command: any) => {
      calls.push(command.constructor.name);
      switch (command.constructor.name) {
        case 'DescribeServiceDeploymentsCommand': return { serviceDeployments: [{ serviceArn: service,
          targetServiceRevision: { arn: badIdentity ? 'other' : 'revision' } }] };
        case 'DescribeServicesCommand': return { services: [{ desiredCount: desired }] };
        case 'ListTasksCommand': return { taskArns: [] };
        default: throw new Error('Unexpected effect');
      }
    } } },
  } as unknown as AwsBlueGreen;
  return { calls, hook, lifecycle, run: () => activationHook(gate, lifecycle, hook),
    desired: (count: number) => { desired = count; }, badIdentity: () => { badIdentity = true; } };
}
it('acknowledges an empty first deployment without provisioning a host or moving traffic', async () => {
  const f = fixture(); expect(await f.run()).toBe('SUCCEEDED');
  expect(f.calls.every(name => name.startsWith('Describe') || name.startsWith('List'))).toBe(true);
});
it('requires a matching activation journal before acknowledging nonempty service startup', async () => {
  const f = fixture(); f.desired(1); expect(await f.run()).toBeUndefined();
});
it('rejects stale or foreign native hook identities before acknowledging empty service creation', async () => {
  const f = fixture(); f.badIdentity(); await expect(f.run()).rejects.toThrow('identity is unverified');
  f.hook.executionDetails.serviceArn += '-foreign'; await expect(f.run()).rejects.toThrow('Unexpected activation hook');
});

import { expect, it } from 'vitest';
import { readNativeDeployment } from '../lib/releases/native-deployment.js';

const native = { serviceArn: 'service/one', serviceDeploymentArn: 'deployment/new', status: 'IN_PROGRESS', lifecycleStage: 'BAKE_TIME',
  targetServiceRevision: { arn: 'revision/green' }, sourceServiceRevisions: [{ arn: 'revision/blue' }] };
it('recovers a lost force acknowledgement using exact source/target service revisions', async () => {
  const ecs: any = { send: async (command: any) => command.constructor.name === 'ListServiceDeploymentsCommand'
    ? { serviceDeployments: [{ serviceDeploymentArn: 'deployment/new' }] } : { serviceDeployments: [native] } };
  expect(await readNativeDeployment(ecs, 'cluster', 'service/one', 'revision/blue', 100_000)).toMatchObject({
    deployment: 'deployment/new', blueRevision: 'revision/blue', greenRevision: 'revision/green', stage: 'BAKE_TIME' });
});
it('rejects competing deployments rather than selecting the newest and hijacking it', async () => {
  const ecs: any = { send: async (command: any) => command.constructor.name === 'ListServiceDeploymentsCommand'
    ? { serviceDeployments: [{ serviceDeploymentArn: 'deployment/new' }, { serviceDeploymentArn: 'deployment/other' }] }
    : { serviceDeployments: [native, { ...native, serviceDeploymentArn: 'deployment/other' }] } };
  await expect(readNativeDeployment(ecs, 'cluster', 'service/one', 'revision/blue', 100_000)).rejects.toThrow('Multiple native deployments');
});
it('keeps the green identity during native rollback and rejects an unrelated service', async () => {
  const known = { service: 'service/one', deployment: 'deployment/new', blueRevision: 'revision/blue', greenRevision: 'revision/green' };
  const ecs: any = { send: async () => ({ serviceDeployments: [{ ...native, status: 'ROLLBACK_IN_PROGRESS' }] }) };
  expect((await readNativeDeployment(ecs, 'cluster', 'service/one', 'revision/blue', 100_000, known))?.greenRevision).toBe('revision/green');
  await expect(readNativeDeployment(ecs, 'cluster', 'service/other', 'revision/blue', 100_000, known)).rejects.toThrow('Unexpected native');
});

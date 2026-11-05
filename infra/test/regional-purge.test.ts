import { expect, it } from 'vitest';
import { planRegionalPurge, purgeRegion, type PurgeInventory, type PurgePorts } from '../lib/regional-purge.js';

const account = '757999402784';
const region = 'eu-west-1';
const tags = { Project: 'ghostline', Environment: 'prod', System: 'shared' };
const queue = `https://sqs.${region}.amazonaws.com/${account}/GhostlineRelease-FailedEvents-old`;
const inventory = (): PurgeInventory => ({ account, region, blockers: [],
  parameters: [{ id: '/ghostline/prod/server/xray', tags, fingerprint: '1:2026-09-22T08:40:54Z' }],
  logGroups: [{ id: 'GhostlineRelease-Logs-old', tags }], queues: [{ id: queue, tags }],
  taskDefinitions: [{ id: `arn:aws:ecs:${region}:${account}:task-definition/ghostline-trial-gateway:1`,
    tags, status: 'ACTIVE' }] });

it('plans exact retained resources after destroy without selecting account security', () => {
  const plan = planRegionalPurge(account, region, inventory());
  expect(plan).toEqual({ account, region, parameters: [{ id: '/ghostline/prod/server/xray', fingerprint: '1:2026-09-22T08:40:54Z' }],
    logGroups: ['GhostlineRelease-Logs-old'], queues: [queue], taskDefinitions: [{
      id: `arn:aws:ecs:${region}:${account}:task-definition/ghostline-trial-gateway:1`, status: 'ACTIVE' }] });
});

it('rejects wrong region, active resources and uncertain ownership before deleting identities', () => {
  const source = inventory();
  expect(() => planRegionalPurge(account, 'af-south-1', source)).toThrow('mismatch');
  source.blockers.push('EC2 instance');
  expect(() => planRegionalPurge(account, region, source)).toThrow('Destroy');
  source.blockers = [];
  source.parameters[0]!.tags = { Project: 'other', Environment: 'prod' };
  expect(() => planRegionalPurge(account, region, source)).toThrow('ownership');
  source.parameters[0]!.tags = tags; source.parameters[0]!.fingerprint = '';
  expect(() => planRegionalPurge(account, region, source)).toThrow('version');
});

it('requires an unchanged reviewed plan and verifies all removals after SQS settles', async () => {
  const source = inventory();
  const calls: string[] = [];
  const ports: PurgePorts = { inventory: async () => structuredClone(source),
    removeTaskDefinition: async arn => { calls.push(`task:${arn}`); source.taskDefinitions = []; },
    removeParameter: async (name, fingerprint) => { calls.push(`parameter:${name}:${fingerprint}`); source.parameters = []; },
    removeLogGroup: async name => { calls.push(`log:${name}`); source.logGroups = []; },
    removeQueue: async url => { calls.push(`queue:${url}`); source.queues = []; },
    settleQueueDeletes: async () => { calls.push('settle'); } };
  const plan = planRegionalPurge(account, region, source);
  await purgeRegion(plan, ports);
  expect(calls).toEqual([`task:${plan.taskDefinitions[0]!.id}`, `parameter:${plan.parameters[0]!.id}:${plan.parameters[0]!.fingerprint}`,
    `log:${plan.logGroups[0]}`, `queue:${queue}`, 'settle']);
  await expect(purgeRegion(plan, ports)).rejects.toThrow('plan changed');
  await purgeRegion(planRegionalPurge(account, region, source), ports);
});

it('stops on a changed plan before the first deletion', async () => {
  const source = inventory();
  const plan = planRegionalPurge(account, region, source);
  source.parameters.push({ id: '/ghostline/prod/server/awg', tags, fingerprint: '1:2026-09-22T08:40:55Z' });
  let deleted = false;
  const ports: PurgePorts = { inventory: async () => source, removeParameter: async () => { deleted = true; },
    removeLogGroup: async () => { deleted = true; }, removeQueue: async () => { deleted = true; },
    removeTaskDefinition: async () => { deleted = true; },
    settleQueueDeletes: async () => {} };
  await expect(purgeRegion(plan, ports)).rejects.toThrow('plan changed');
  expect(deleted).toBe(false);
});

it('reports ECS deletion still in progress without claiming permanent removal', async () => {
  const source = inventory();
  source.parameters = []; source.logGroups = []; source.queues = [];
  const arn = source.taskDefinitions[0]!.id;
  const ports: PurgePorts = { inventory: async () => structuredClone(source),
    removeTaskDefinition: async () => { source.taskDefinitions[0]!.status = 'DELETE_IN_PROGRESS'; },
    removeParameter: async () => {}, removeLogGroup: async () => {}, removeQueue: async () => {},
    settleQueueDeletes: async () => {} };
  expect(await purgeRegion(planRegionalPurge(account, region, source), ports)).toEqual([arn]);
});

export interface PurgeResource {
  id: string;
  tags: Record<string, string>;
  status?: 'ACTIVE' | 'INACTIVE' | 'DELETE_IN_PROGRESS';
  fingerprint?: string;
}

export interface PurgeInventory {
  account: string;
  region: string;
  blockers: string[];
  parameters: PurgeResource[];
  logGroups: PurgeResource[];
  queues: PurgeResource[];
  taskDefinitions: PurgeResource[];
}

export interface PurgePlan {
  account: string;
  region: string;
  parameters: Array<{ id: string; fingerprint: string }>;
  logGroups: string[];
  queues: string[];
  taskDefinitions: Array<{ id: string; status: 'ACTIVE' | 'INACTIVE' | 'DELETE_IN_PROGRESS' }>;
}

export interface PurgePorts {
  inventory(): Promise<PurgeInventory>;
  removeParameter(name: string, fingerprint: string): Promise<void>;
  removeLogGroup(name: string): Promise<void>;
  removeQueue(url: string): Promise<void>;
  removeTaskDefinition(arn: string): Promise<void>;
  settleQueueDeletes(): Promise<void>;
}

export function planRegionalPurge(account: string, region: string, inventory: PurgeInventory): PurgePlan {
  // The operation follows destroy and may delete identities, so any live regional dependency fails closed.
  if (inventory.account !== account || inventory.region !== region) throw new Error('Purge inventory account or region mismatch.');
  if (inventory.blockers.length) throw new Error(`Destroy the regional deployment before purge: ${inventory.blockers.join(', ')}`);
  const selected = (resources: PurgeResource[], matches: (id: string) => boolean, kind: string) => {
    for (const resource of resources) {
      if (!matches(resource.id) || resource.tags.Project !== 'ghostline' || resource.tags.Environment !== 'prod') {
        throw new Error(`Uncertain ${kind} ownership: ${resource.id}`);
      }
    }
    return resources.map(resource => resource.id).sort();
  };
  return {
    account, region,
    parameters: inventory.parameters.map(resource => {
      if (!resource.id.startsWith('/ghostline/') || resource.tags.Project !== 'ghostline'
        || resource.tags.Environment !== 'prod' || !resource.fingerprint) {
        throw new Error(`Uncertain parameter ownership or version: ${resource.id}`);
      }
      return { id: resource.id, fingerprint: resource.fingerprint };
    }).sort((a, b) => a.id.localeCompare(b.id)),
    logGroups: selected(inventory.logGroups, id => /ghostline/i.test(id), 'log group'),
    queues: selected(inventory.queues, id => id.includes(`sqs.${region}.amazonaws.com/${account}/`) && /ghostline/i.test(id), 'queue'),
    taskDefinitions: inventory.taskDefinitions.map(resource => {
      if (!resource.id.startsWith(`arn:aws:ecs:${region}:${account}:task-definition/`)
        || !/ghostline/i.test(resource.id.split('/')[1] ?? '')
        || resource.tags.Project !== 'ghostline' || resource.tags.Environment !== 'prod'
        || !['ACTIVE', 'INACTIVE', 'DELETE_IN_PROGRESS'].includes(resource.status ?? '')) {
        throw new Error(`Uncertain task definition ownership: ${resource.id}`);
      }
      return { id: resource.id, status: resource.status! };
    }).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export async function purgeRegion(plan: PurgePlan, ports: PurgePorts): Promise<string[]> {
  // Re-inventory on each run; a partial failure is resumed by deleting only verified remaining resources.
  const fresh = planRegionalPurge(plan.account, plan.region, await ports.inventory());
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) throw new Error('Purge plan changed; review a fresh plan before executing.');
  for (const task of plan.taskDefinitions) if (task.status !== 'DELETE_IN_PROGRESS') await ports.removeTaskDefinition(task.id);
  for (const parameter of plan.parameters) await ports.removeParameter(parameter.id, parameter.fingerprint);
  for (const name of plan.logGroups) await ports.removeLogGroup(name);
  for (const url of plan.queues) await ports.removeQueue(url);
  if (plan.queues.length) await ports.settleQueueDeletes();
  const remaining = planRegionalPurge(plan.account, plan.region, await ports.inventory());
  if (remaining.parameters.length || remaining.logGroups.length || remaining.queues.length
    || remaining.taskDefinitions.some(task => task.status !== 'DELETE_IN_PROGRESS')) {
    throw new Error('Regional purge is incomplete; inspect and rerun with a fresh plan.');
  }
  // ECS can finish task-definition deletion asynchronously after the API accepts it.
  return remaining.taskDefinitions.map(task => task.id);
}

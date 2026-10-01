import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

export type LifecycleMode = 'active' | 'stopped' | 'parked' | 'destroying' | 'destroyed';
export interface LifecycleState {
  version: number;
  mode: LifecycleMode;
  operation?: { kind: string; owner: string; startedAt: number; failure?: string };
}
export interface LifecycleStore {
  read(): Promise<LifecycleState | undefined>;
  replace(next: LifecycleState, previous?: LifecycleState): Promise<boolean>;
}
export class DynamoLifecycleStore implements LifecycleStore {
  constructor(private readonly db: Pick<DynamoDBClient, 'send'>, private readonly table: string) {}
  async read(): Promise<LifecycleState | undefined> {
    const response = await this.db.send(new GetItemCommand({ TableName: this.table, Key: { id: { S: 'lifecycle' } }, ConsistentRead: true }));
    return response.Item?.record?.S ? JSON.parse(response.Item.record.S) as LifecycleState : undefined;
  }
  async replace(next: LifecycleState, previous?: LifecycleState): Promise<boolean> {
    // No TTL unlock: a killed CLI can leave an uncertain AWS operation, not permission for another writer to race it.
    try {
      await this.db.send(new PutItemCommand({ TableName: this.table,
        Item: { id: { S: 'lifecycle' }, version: { N: String(next.version) }, record: { S: JSON.stringify(next) } },
        ConditionExpression: previous ? '#v = :v' : 'attribute_not_exists(id)',
        ...(previous ? { ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': { N: String(previous.version) } } } : {}) }));
      return true;
    } catch (error) { if ((error as Error).name === 'ConditionalCheckFailedException') return false; throw error; }
  }
}

export async function claimLifecycle(store: LifecycleStore, kind: string, owner: string,
  mode?: LifecycleMode): Promise<LifecycleState | undefined> {
  const before = await store.read();
  if (before?.operation && (before.operation.owner !== owner || before.operation.kind !== kind)) return undefined;
  if (kind === 'release' && before?.mode !== 'active') return undefined;
  if (kind === 'release-cleanup' && !['active', 'stopped'].includes(before?.mode ?? '')) return undefined;
  // Resumption retains the same operation identity; a second process cannot silently claim a different operation.
  if (before?.operation) return before;
  const next: LifecycleState = { version: (before?.version ?? 0) + 1, mode: mode ?? before?.mode ?? 'active',
    operation: { kind, owner, startedAt: Date.now() } };
  return await store.replace(next, before) ? next : undefined;
}

export async function handoffToRelease(store: LifecycleStore, claim: LifecycleState, mode = claim.mode): Promise<void> {
  // CLI prepares green before an IaC task change, then transfers exclusion so synchronous ECS hooks cannot deadlock on its lock.
  if (!claim.operation || !await store.replace({ ...claim, mode, version: claim.version + 1,
    operation: { kind: 'release', owner: 'regional-release-controller', startedAt: claim.operation.startedAt } }, claim)) {
    throw new Error('Lifecycle ownership changed before controller handoff.');
  }
}

export async function completeLifecycle(store: LifecycleStore, claim: LifecycleState, mode = claim.mode): Promise<void> {
  if (!claim.operation || !await store.replace({ version: claim.version + 1, mode }, claim)) {
    throw new Error('Lifecycle ownership changed; do not continue mutations.');
  }
}

export async function failLifecycle(store: LifecycleStore, claim: LifecycleState, failure: string): Promise<void> {
  if (!claim.operation || !await store.replace({ ...claim, version: claim.version + 1,
    operation: { ...claim.operation, failure } }, claim)) throw new Error('Could not record incomplete lifecycle operation.');
}

export async function coordinatedRelease(store: LifecycleStore, run: (mode: LifecycleMode) => Promise<string>, cleanup = false): Promise<string> {
  // One reserved-concurrency controller resumes its durable claim across events. CLI writers use unique persisted owners.
  const claim = await claimLifecycle(store, cleanup ? 'release-cleanup' : 'release', 'regional-release-controller');
  if (!claim) return 'lifecycle-held';
  try {
    const status = await run(claim.mode);
    if (!['deployment-requested', 'deployment-in-progress', 'action-in-progress', 'observation-pending'].includes(status)) await completeLifecycle(store, claim);
    return status;
  } catch (error) {
    await failLifecycle(store, claim, 'Release reconciliation interrupted; the controller will observe state before resuming.');
    throw error;
  }
}

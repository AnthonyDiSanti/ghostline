import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';

export interface ActiveTrial {
  version: number;
  id: string;
  target: string;
  candidate: string;
  phase: string;
  startedAt: string;
}

export class RegionalTrialExcluded extends Error {
  constructor(readonly target: string, readonly trial: string) {
    super(`${target}: operation deferred while regional candidate trial ${trial} is active.`);
    this.name = 'RegionalTrialExcluded';
  }
}

const conflicting = new Set(['deploy', 'start', 'stop', 'park', 'unpark', 'destroy',
  'release-infrastructure', 'release-mode', 'image-retention', 'derp-provision']);

export function assertTrialAdmission(trial: ActiveTrial | undefined, kind: string, target: string, admittedTrial?: string): void {
  // Verification/native hooks and the trial's own checked operations remain available; ordinary mutations wait.
  if (!trial || !conflicting.has(kind)) return;
  if (trial.target !== target || !trial.id || !Number.isInteger(trial.version)) throw new Error('Regional trial exclusion is malformed.');
  // The explicit trial runner may use the existing deploy path, never candidate power operations.
  if (admittedTrial === trial.id && ['deploy', 'release-infrastructure'].includes(kind)) return;
  throw new RegionalTrialExcluded(target, trial.id);
}

export async function readActiveTrial(db: Pick<DynamoDBClient, 'send'>, table: string): Promise<ActiveTrial | undefined> {
  // One authoritative regional marker supplies all jobs' exclusions; no expiry silently re-enables operations.
  const response = await db.send(new GetItemCommand({ TableName: table, Key: { id: { S: 'trial/current' } }, ConsistentRead: true }));
  return response.Item?.record?.S ? JSON.parse(response.Item.record.S) as ActiveTrial : undefined;
}

export function reportTrialExclusion(error: unknown): boolean {
  // A distinct exit/status lets a batch runner defer one region and continue others without claiming success.
  if (!(error instanceof RegionalTrialExcluded)) return false;
  console.log(JSON.stringify({ status: 'deferred', target: error.target, reason: 'active-candidate-trial', trial: error.trial }));
  return true;
}

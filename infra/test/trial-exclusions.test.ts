import { GetItemCommand, PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { expect, it } from 'vitest';
import { assertTrialAdmission, RegionalTrialExcluded, type ActiveTrial } from '../lib/releases/trial-exclusions.js';
import { claimLifecycle, DynamoLifecycleStore } from '../lib/releases/lifecycle.js';

const trial: ActiveTrial = { version: 1, id: 'trial-test', target: 'stockholm-ecs', candidate: `sha256:${'a'.repeat(64)}`,
  phase: 'testing', startedAt: '2026-11-17T00:00:00Z' };

it('defers conflicting production operations without preventing verification, native work or trial closeout', () => {
  for (const action of ['deploy', 'start', 'stop', 'park', 'unpark', 'destroy', 'release-infrastructure', 'image-retention', 'derp-provision']) {
    expect(() => assertTrialAdmission(trial, action, trial.target)).toThrow(RegionalTrialExcluded);
    expect(() => assertTrialAdmission(undefined, action, 'oregon')).not.toThrow();
  }
  for (const action of ['verify', 'platform-qualify', 'candidate-deploy', 'candidate-finish', 'release']) {
    expect(() => assertTrialAdmission(trial, action, trial.target)).not.toThrow();
  }
  expect(() => assertTrialAdmission(trial, 'deploy', trial.target, trial.id)).not.toThrow();
  expect(() => assertTrialAdmission(trial, 'stop', trial.target, trial.id)).toThrow(RegionalTrialExcluded);
  expect(() => assertTrialAdmission(trial, 'deploy', trial.target, 'another-trial')).toThrow(RegionalTrialExcluded);
});

it('checks exclusion after the lifecycle version read and before any power-intent write', async () => {
  // Simulate a reader that saw no trial earlier; the fresh claim guard rejects it without writing stopped intent.
  let writes = 0;
  const client = { send: async (command: unknown) => {
    if (command instanceof GetItemCommand) return { Item: { record: { S: JSON.stringify({ version: 4, mode: 'active' }) } } };
    if (command instanceof PutItemCommand) { writes++; return {}; }
    throw new Error('Unexpected transport call');
  } } as unknown as Pick<DynamoDBClient, 'send'>;
  const store = new DynamoLifecycleStore(client, 'trial-table', async kind => assertTrialAdmission(trial, kind, trial.target));
  await expect(claimLifecycle(store, 'stop', 'other-owner', 'stopped')).rejects.toThrow(RegionalTrialExcluded);
  expect(writes).toBe(0);
});

it('lets CAS reject a trial installed after admission instead of acquiring a stale normal-operation claim', async () => {
  // Installing a marker requires a lifecycle writer, so its intervening version change defeats this conditional put.
  let checked = false, versionMatched = false;
  const client = { send: async (command: unknown) => {
    if (command instanceof GetItemCommand) return { Item: { record: { S: JSON.stringify({ version: 4, mode: 'active' }) } } };
    if (command instanceof PutItemCommand) {
      versionMatched = command.input.ExpressionAttributeValues?.[':v']?.N === '4';
      throw Object.assign(new Error('newer trial writer'), { name: 'ConditionalCheckFailedException' });
    }
    throw new Error('Unexpected transport call');
  } } as unknown as Pick<DynamoDBClient, 'send'>;
  const store = new DynamoLifecycleStore(client, 'trial-table', async () => { checked = true; });
  expect(await claimLifecycle(store, 'stop', 'other-owner', 'stopped')).toBeUndefined();
  expect(checked && versionMatched).toBe(true);
});

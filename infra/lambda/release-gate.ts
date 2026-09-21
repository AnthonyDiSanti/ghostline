import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { AwsGate } from '../lib/releases/aws-gate.js';
import { readiness, reconcile } from '../lib/releases/gate.js';
import { EcrRegistry } from '../lib/releases/registry.js';

export async function handler(event: { action?: string } = {}) {
  const region = process.env.AWS_REGION!;
  const gate = new AwsGate(new EcrRegistry(new ECRClient({ region }), process.env.ACCOUNT!, region),
    { cluster: process.env.CLUSTER!, service: process.env.SERVICE!, table: process.env.TABLE!, topic: process.env.TOPIC! },
    // Force deployment has no idempotency token. Leave ambiguous retries to the operator, not the SDK.
    new ECSClient({ region, maxAttempts: 1 }), new DynamoDBClient({ region }), new SNSClient({ region }));
  if (event.action === 'retry') {
    const current = (await readiness(gate.registry)).current;
    if (!current) throw new Error('No current release to retry.');
    const service = await gate.service();
    if (service?.busy) throw new Error('An ECS deployment is already in progress.');
    const previous = await gate.attempt(current.digest);
    if (previous && !await gate.save({ ...previous, version: previous.version + 1, state: 'cancelled', startedAt: gate.now() }, previous)) {
      throw new Error('Concurrent release-state change. Retry after inspection.');
    }
  }
  if (process.env.AUTOMATION !== 'enabled') return { status: 'automation-disabled' };
  const status = await reconcile(gate);
  console.log(JSON.stringify({ status }));
  return { status };
}

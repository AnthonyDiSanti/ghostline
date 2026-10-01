import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SSMClient } from '@aws-sdk/client-ssm';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { AwsBlueGreen } from '../lib/releases/aws-blue-green.js';
import type { DeploymentHook } from '../lib/releases/deployment-hook.js';
import { reconcileRollout } from '../lib/releases/rollout-controller.js';
import { coordinatedRelease, DynamoLifecycleStore } from '../lib/releases/lifecycle.js';
import { EcrRegistry } from '../lib/releases/registry.js';
import { relevantReleaseEvent } from '../lib/releases/events.js';
import { activationHook } from '../lib/releases/activation-hook.js';

export async function handler(event: { action?: string; source?: string; 'detail-type'?: string; detail?: Record<string, any>; lifecycleStage?: string } = {}) {
  if (!relevantReleaseEvent(event)) return { status: 'irrelevant-event' };
  const region = process.env.AWS_REGION!;
  const hook = event.lifecycleStage ? event as unknown as DeploymentHook : undefined;
  if (process.env.AUTOMATION !== 'enabled' && !hook) return { status: 'automation-disabled' };
  const db = new DynamoDBClient({ region });
  const lifecycle = new DynamoLifecycleStore(db, process.env.TABLE!);
  const gate = new AwsBlueGreen({ endpoint: process.env.ENDPOINT_STACK!, account: process.env.ACCOUNT!, region,
    cluster: process.env.CLUSTER!, service: process.env.SERVICE!, table: process.env.TABLE!, topic: process.env.TOPIC!,
    observerDocument: process.env.OBSERVER_DOCUMENT!, progressRule: process.env.PROGRESS_RULE!,
    templates: JSON.parse(process.env.SLOT_TEMPLATES!), role: process.env.SLOT_ROLE!, tags: JSON.parse(process.env.OWNER_TAGS!) },
    // Force deployment and address moves use observation-based recovery instead of automatic SDK mutation retries.
    { cfn: new CloudFormationClient({ region }), ec2: new EC2Client({ region, maxAttempts: 1 }),
      ecs: new ECSClient({ region, maxAttempts: 1 }), db, ssm: new SSMClient({ region }),
      sns: new SNSClient({ region }), events: new EventBridgeClient({ region }) },
    new EcrRegistry(new ECRClient({ region }), process.env.ACCOUNT!, region), 'active');
  let hookStatus: 'SUCCEEDED' | 'FAILED' | 'IN_PROGRESS' | undefined;
  if (hook) {
    // Initial/empty-service hooks are observational only and can run while the owning CLI waits for CloudFormation.
    const initial = await activationHook(gate, await lifecycle.read(), hook);
    if (initial) return { hookStatus: initial, ...(initial === 'IN_PROGRESS' ? { callBackDelay: 5 } : {}) };
  }
  const cleanup = event.action === 'cleanup-failed' || (await lifecycle.read())?.operation?.kind === 'release-cleanup';
  const status = await coordinatedRelease(lifecycle, async mode => {
    gate.mode = mode; // Use the state actually claimed, not an earlier read that could race a CLI power action.
    const result = await reconcileRollout(gate, event.action === 'retry' || event.action === 'cleanup-failed' ? event.action : undefined, hook);
    hookStatus = result.hookStatus;
    return result.status;
  }, cleanup);
  if (status === 'lifecycle-held') await gate.progress(false);
  console.log(JSON.stringify({ status }));
  return hook ? { hookStatus: hookStatus ?? 'IN_PROGRESS', ...(hookStatus === 'SUCCEEDED' || hookStatus === 'FAILED' ? {} : { callBackDelay: 5 }) } : { status };
}

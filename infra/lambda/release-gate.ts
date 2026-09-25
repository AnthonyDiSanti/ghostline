import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SSMClient } from '@aws-sdk/client-ssm';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { AwsStackGate } from '../lib/releases/aws-stack.js';
import { reconcileController } from '../lib/releases/controller.js';
import { coordinatedRelease, DynamoLifecycleStore } from '../lib/releases/lifecycle.js';
import { EcrRegistry } from '../lib/releases/registry.js';
import { relevantReleaseEvent } from '../lib/releases/events.js';

export async function handler(event: { action?: string; source?: string; 'detail-type'?: string; detail?: Record<string, any> } = {}) {
  if (!relevantReleaseEvent(event)) return { status: 'irrelevant-event' };
  const region = process.env.AWS_REGION!;
  if (process.env.AUTOMATION !== 'enabled') return { status: 'automation-disabled' };
  const db = new DynamoDBClient({ region });
  const lifecycle = new DynamoLifecycleStore(db, process.env.TABLE!);
  const gate = new AwsStackGate(new EcrRegistry(new ECRClient({ region }), process.env.ACCOUNT!, region),
    { stack: process.env.ENDPOINT_STACK!, cluster: process.env.CLUSTER!, service: process.env.SERVICE!,
      daemon: process.env.DAEMON!, table: process.env.TABLE!, topic: process.env.TOPIC!,
      observerDocument: process.env.OBSERVER_DOCUMENT!, progressRule: process.env.PROGRESS_RULE! },
    // Lifecycle effects lack idempotency tokens. Observe uncertain outcomes; do not let SDK retries repeat them.
    { cfn: new CloudFormationClient({ region }), ec2: new EC2Client({ region, maxAttempts: 1 }),
      ecs: new ECSClient({ region, maxAttempts: 1 }), db, ssm: new SSMClient({ region }),
      sns: new SNSClient({ region }), events: new EventBridgeClient({ region }) }, 'active');
  const status = await coordinatedRelease(lifecycle, async () => {
    return reconcileController(gate, event.action === 'retry');
  });
  if (status === 'lifecycle-held') await gate.progress(false);
  console.log(JSON.stringify({ status }));
  return { status };
}

import type { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import type { EC2Client } from '@aws-sdk/client-ec2';
import type { ECSClient } from '@aws-sdk/client-ecs';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { SSMClient } from '@aws-sdk/client-ssm';
import type { SNSClient } from '@aws-sdk/client-sns';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';

export interface StackClients {
  cfn: Pick<CloudFormationClient, 'send'>; ec2: Pick<EC2Client, 'send'>; ecs: Pick<ECSClient, 'send'>;
  db: Pick<DynamoDBClient, 'send'>; ssm: Pick<SSMClient, 'send'>; sns: Pick<SNSClient, 'send'>; events: Pick<EventBridgeClient, 'send'>;
}

export function retryObservations<T extends { send: (...args: any[]) => Promise<any> }>(client: T,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Pick<T, 'send'> {
  // Mutation clients deliberately disable SDK retries. Read-only discovery can safely recover from an idle socket reset.
  return { send: (async (command: { constructor: { name: string } }, ...args: any[]) => {
    const observation = /^(Describe|List|Get)[A-Z].*Command$/.test(command.constructor.name);
    for (let attempt = 0; ; attempt++) {
      try { return await client.send(command, ...args); }
      catch (error) {
        if (!observation || attempt >= 2 || !['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await wait(250 * (attempt + 1));
      }
    }
  }) as T['send'] };
}

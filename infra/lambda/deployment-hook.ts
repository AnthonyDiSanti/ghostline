import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { receiveHook } from '../lib/releases/hook-receiver.js';
import type { DeploymentHook } from '../lib/releases/deployment-hook.js';

export async function handler(event: DeploymentHook) {
  // ECS retries IN_PROGRESS itself; keep throttling away from its fatal invocation-error path without duplicating mutation authority.
  const client = new LambdaClient({ maxAttempts: 1, requestHandler: { connectionTimeout: 5_000, requestTimeout: 65_000, throwOnRequestTimeout: true } });
  return receiveHook(event, process.env.SERVICE!, value => client.send(new InvokeCommand({
    FunctionName: process.env.CONTROLLER!, InvocationType: 'RequestResponse', Payload: Buffer.from(JSON.stringify(value)),
  })));
}

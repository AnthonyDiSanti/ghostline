import { expect, it, vi } from 'vitest';
import { ECSClient } from '@aws-sdk/client-ecs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { SSMClient } from '@aws-sdk/client-ssm';
import { ECRClient } from '@aws-sdk/client-ecr';
import { AwsGate } from '../lib/releases/aws-gate.js';
import { EcrRegistry, isQualifiedImage } from '../lib/releases/registry.js';
import { createHandler } from '../packages/notifications/src/subscription.js';

it('verifies both classic Docker config IDs and containerd manifest IDs against published bytes', () => {
  const root = { digest: 'index', manifest: '{}', mediaType: 'index' };
  const runtime = { digest: 'child', manifest: JSON.stringify({ config: { digest: 'config' } }), mediaType: 'manifest' };
  for (const imageId of ['index', 'child', 'config']) expect(isQualifiedImage(imageId, root, runtime)).toBe(true);
  expect(isQualifiedImage('other', root, runtime)).toBe(false);
});

it('uses only the exact force request and preserves conditional attempt writes', async () => {
  const send = vi.fn(async () => ({}));
  const ecs = { send } as unknown as ECSClient;
  const dbSend = vi.fn(async () => { throw Object.assign(new Error(), { name: 'ConditionalCheckFailedException' }); });
  const gate = new AwsGate(new EcrRegistry(new ECRClient({}), '000000000000', 'us-east-1'),
    { cluster: 'selected', service: 'gateway', table: 'attempts', topic: 'alerts' }, ecs,
    { send: dbSend } as unknown as DynamoDBClient, new SNSClient({}));
  await gate.force();
  expect((send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toEqual({ cluster: 'selected', service: 'gateway', forceNewDeployment: true });
  const record = { release: 'release', version: 1, state: 'claimed' as const, incarnation: 'one', startedAt: 1, baseline: [] };
  expect(await gate.save(record)).toBe(false);
  expect((dbSend.mock.calls[0] as unknown as [{ input: any }])[0].input.ConditionExpression).toBe('attribute_not_exists(id)');
});

it('treats only missing registry images as partial delivery', async () => {
  const send = vi.fn(async () => ({ failures: [{ failureCode: 'ImageNotFound' }] }));
  const registry = new EcrRegistry({ send } as unknown as ECRClient, '000000000000', 'us-east-1');
  expect(await registry.get('owned/repo', 'keep-production')).toBeUndefined();
  send.mockResolvedValue({ failures: [{ failureCode: 'UpstreamAccessDenied' }] });
  await expect(registry.get('owned/repo', 'keep-production')).rejects.toThrow('failed');
});

it('keeps subscription addresses out of physical IDs and handles pending subscriptions across pages', async () => {
  const ssmSend = vi.fn(async () => ({ Parameter: { Type: 'SecureString', Value: 'USER@example.invalid' } }));
  const snsSend = vi.fn(async (command: any): Promise<any> => {
    if (command.constructor.name === 'ListSubscriptionsByTopicCommand') return command.input.NextToken
      ? { Subscriptions: [{ Endpoint: 'user@example.invalid', Protocol: 'email', SubscriptionArn: 'PendingConfirmation' }] }
      : { Subscriptions: [], NextToken: 'second' };
    throw new Error('Unexpected subscription mutation');
  });
  const handler = createHandler({ send: ssmSend } as unknown as SSMClient, { send: snsSend } as unknown as SNSClient);
  const properties = { TopicArn: 'arn:aws:sns:us-east-1:000000000000:alerts', EmailParamName: '/app/alerts/email' };
  const created = await handler({ RequestType: 'Create', ResourceProperties: properties });
  expect(created.PhysicalResourceId).toMatch(/^[a-f0-9]{64}$/);
  expect(snsSend).toHaveBeenCalledTimes(2);
  await handler({ RequestType: 'Delete', ResourceProperties: properties, PhysicalResourceId: created.PhysicalResourceId });
  expect(ssmSend).toHaveBeenCalledTimes(1);
});

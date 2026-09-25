import { expect, it, vi } from 'vitest';
import { SNSClient } from '@aws-sdk/client-sns';
import { SSMClient } from '@aws-sdk/client-ssm';
import { ECRClient } from '@aws-sdk/client-ecr';
import { EcrRegistry, isQualifiedImage } from '../lib/releases/registry.js';
import { createHandler } from '../packages/notifications/src/subscription.js';

it('verifies both classic Docker config IDs and containerd manifest IDs against published bytes', () => {
  const root = { digest: 'index', manifest: '{}', mediaType: 'index' };
  const runtime = { digest: 'child', manifest: JSON.stringify({ config: { digest: 'config' } }), mediaType: 'manifest' };
  for (const imageId of ['index', 'child', 'config']) expect(isQualifiedImage(imageId, root, runtime)).toBe(true);
  expect(isQualifiedImage('other', root, runtime)).toBe(false);
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

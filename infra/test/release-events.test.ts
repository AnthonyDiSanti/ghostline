import { expect, it } from 'vitest';
import { imageArrivalPattern, imageAliasPattern, relevantReleaseEvent } from '../lib/releases/events.js';
import { handler } from '../lambda/release-gate.js';

it('accepts successful owned pushes, replication and tag writes', () => {
  for (const [kind, action] of [['ECR Image Action', 'PUSH'], ['ECR Replication Action', 'REPLICATE']]) {
    expect(relevantReleaseEvent({ source: 'aws.ecr', 'detail-type': kind, detail: {
      result: 'SUCCESS', 'action-type': action, 'repository-name': 'ghostline/prod/releases' } })).toBe(true);
  }
  expect(relevantReleaseEvent({ source: 'aws.ecr', 'detail-type': 'AWS API Call via CloudTrail',
    detail: { eventSource: 'ecr.amazonaws.com', eventName: 'PutImage', requestParameters: { repositoryName: 'ghostline/prod/awg' } } })).toBe(true);
});
it('rejects its own audited ECR reads, even if they were queued before the rule was fixed', () => {
  for (const eventName of ['BatchGetImage', 'DescribeImages', 'GetAuthorizationToken', 'BatchCheckLayerAvailability']) {
    expect(relevantReleaseEvent({ source: 'aws.ecr', 'detail-type': 'AWS API Call via CloudTrail',
      detail: { eventSource: 'ecr.amazonaws.com', eventName, requestParameters: { repositoryName: 'ghostline/prod/awg' } } })).toBe(false);
  }
  expect(imageArrivalPattern.detailType).not.toContain('AWS API Call via CloudTrail');
  expect(imageAliasPattern.detail?.eventName).toEqual(['PutImage']);
});
it('drops a queued read before constructing the cloud reconciliation path', async () => {
  // No regional configuration or credentials are needed to discard a stale read event.
  expect(await handler({ source: 'aws.ecr', 'detail-type': 'AWS API Call via CloudTrail',
    detail: { eventSource: 'ecr.amazonaws.com', eventName: 'BatchGetImage' } })).toEqual({ status: 'irrelevant-event' });
});
it('ignores unrelated repositories and failed writes without filtering hourly/operator/ECS wakeups', () => {
  expect(relevantReleaseEvent({ source: 'aws.ecr', 'detail-type': 'ECR Image Action', detail: {
    result: 'SUCCESS', 'action-type': 'PUSH', 'repository-name': 'another/app' } })).toBe(false);
  expect(relevantReleaseEvent({ source: 'aws.ecr', 'detail-type': 'AWS API Call via CloudTrail', detail: {
    eventSource: 'ecr.amazonaws.com', eventName: 'PutImage', errorCode: 'AccessDenied', requestParameters: { repositoryName: 'ghostline/prod/awg' } } })).toBe(false);
  for (const source of [undefined, 'aws.events', 'aws.ecs']) expect(relevantReleaseEvent({ source })).toBe(true);
});

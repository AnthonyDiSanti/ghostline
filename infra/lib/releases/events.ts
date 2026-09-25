import type { EventPattern } from 'aws-cdk-lib/aws-events';
import { repositoryPrefix } from './model.js';

// Account trails include read events. A source-only rule would turn the gate's own ECR reads into a feedback loop.
export const imageArrivalPattern: EventPattern = { source: ['aws.ecr'],
  detailType: ['ECR Image Action', 'ECR Replication Action'],
  detail: { result: ['SUCCESS'], 'action-type': ['PUSH', 'REPLICATE'], 'repository-name': [{ prefix: repositoryPrefix }] } };
export const imageAliasPattern: EventPattern = { source: ['aws.ecr'], detailType: ['AWS API Call via CloudTrail'],
  detail: { eventSource: ['ecr.amazonaws.com'], eventName: ['PutImage'], errorCode: [{ exists: false }],
    requestParameters: { repositoryName: [{ prefix: repositoryPrefix }] } } };

export function relevantReleaseEvent(event: { source?: string; 'detail-type'?: string; detail?: Record<string, any> }): boolean {
  // Previously queued source-only events can outlive a rule update. Discard their reads before any further AWS calls.
  if (event.source !== 'aws.ecr') return true;
  const d = event.detail ?? {};
  if (['ECR Image Action', 'ECR Replication Action'].includes(event['detail-type'] ?? '')) {
    return d.result === 'SUCCESS' && ['PUSH', 'REPLICATE'].includes(d['action-type'])
      && typeof d['repository-name'] === 'string' && d['repository-name'].startsWith(repositoryPrefix);
  }
  return event['detail-type'] === 'AWS API Call via CloudTrail' && d.eventSource === 'ecr.amazonaws.com'
    && d.eventName === 'PutImage' && !d.errorCode && typeof d.requestParameters?.repositoryName === 'string'
    && d.requestParameters.repositoryName.startsWith(repositoryPrefix);
}

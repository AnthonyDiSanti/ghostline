import { expect, it } from 'vitest';
import { trafficDestination, validateDeploymentHook, type DeploymentIdentity } from '../lib/releases/deployment-hook.js';

const expected: DeploymentIdentity = { service: 'service/test', deployment: 'deployment/current', blueRevision: 'revision/blue', greenRevision: 'revision/green' };
const event = () => ({ executionId: 'execution-current', lifecycleStage: 'PRODUCTION_TRAFFIC_SHIFT', resourceArn: expected.deployment,
  executionDetails: { serviceArn: expected.service, targetServiceRevisionArn: expected.greenRevision,
    productionTrafficWeights: { [expected.blueRevision]: 0, [expected.greenRevision]: 100 } } });

it('uses reversed weights, not the unchanged green target, to identify native rollback', () => {
  const hook = event();
  expect(trafficDestination(hook, expected)).toBe('green');
  hook.executionDetails.productionTrafficWeights = { [expected.blueRevision]: 100, [expected.greenRevision]: 0 };
  expect(trafficDestination(hook, expected)).toBe('blue');
});
it('rejects stale deployments, unexpected services, and revisions before considering traffic', () => {
  expect(() => trafficDestination({ ...event(), resourceArn: 'deployment/old' }, expected)).toThrow('recorded');
  const other = event(); other.executionDetails.serviceArn = 'service/other';
  expect(() => trafficDestination(other, expected)).toThrow('recorded');
  other.executionDetails.serviceArn = expected.service; other.executionDetails.targetServiceRevisionArn = expected.blueRevision;
  expect(() => trafficDestination(other, expected)).toThrow('recorded');
});
it('requires explicit complete direction and never guesses from absent, partial, or extra weights', () => {
  for (const weights of [{}, { [expected.greenRevision]: 100 }, { [expected.blueRevision]: 50, [expected.greenRevision]: 50 },
    { [expected.blueRevision]: 0, [expected.greenRevision]: 100, 'revision/unknown': 0 }]) {
    const hook = event(); hook.executionDetails.productionTrafficWeights = weights;
    expect(() => trafficDestination(hook, expected)).toThrow();
  }
});
it('accepts other configured stages for readiness without granting traffic-move authority', () => {
  const hook = { ...event(), lifecycleStage: 'POST_SCALE_UP' };
  expect(validateDeploymentHook(hook, expected).lifecycleStage).toBe('POST_SCALE_UP');
  expect(() => trafficDestination(hook, expected)).toThrow('direction');
  expect(() => validateDeploymentHook({ source: 'aws.events' }, expected)).toThrow('recorded');
});

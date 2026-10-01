export const deploymentStages = ['PRE_SCALE_UP', 'POST_SCALE_UP', 'PRODUCTION_TRAFFIC_SHIFT', 'POST_PRODUCTION_TRAFFIC_SHIFT'] as const;
export type DeploymentStage = typeof deploymentStages[number];
export interface DeploymentIdentity {
  service: string;
  deployment: string;
  blueRevision: string;
  greenRevision: string;
}
export interface DeploymentHook {
  executionId: string;
  lifecycleStage: DeploymentStage;
  resourceArn: string;
  executionDetails: {
    serviceArn: string;
    targetServiceRevisionArn: string;
    productionTrafficWeights: Record<string, number>;
  };
}

export function validateDeploymentHook(value: unknown, expected: DeploymentIdentity): DeploymentHook {
  // Scheduled events and stale deployment callbacks must never gain authority over the active host handoff.
  const hook = value as DeploymentHook;
  if (!hook || typeof hook.executionId !== 'string' || !hook.executionId
    || !deploymentStages.includes(hook.lifecycleStage) || hook.resourceArn !== expected.deployment
    || hook.executionDetails?.serviceArn !== expected.service
    || hook.executionDetails.targetServiceRevisionArn !== expected.greenRevision
    || expected.blueRevision === expected.greenRevision) throw new Error('Lifecycle hook does not match the recorded deployment.');
  return hook;
}

export function trafficDestination(value: unknown, expected: DeploymentIdentity): 'blue' | 'green' {
  const hook = validateDeploymentHook(value, expected);
  // ECS keeps targetServiceRevisionArn pointing at green during rollback; only the explicit weights change direction.
  const weights = hook.executionDetails.productionTrafficWeights;
  if (hook.lifecycleStage !== 'PRODUCTION_TRAFFIC_SHIFT' || !weights || Array.isArray(weights)
    || Object.keys(weights).length !== 2 || !Object.hasOwn(weights, expected.blueRevision)
    || !Object.hasOwn(weights, expected.greenRevision)) throw new Error('Missing exact production traffic direction.');
  if (weights[expected.blueRevision] === 100 && weights[expected.greenRevision] === 0) return 'blue';
  if (weights[expected.blueRevision] === 0 && weights[expected.greenRevision] === 100) return 'green';
  throw new Error('Direct EIPs require a complete blue or green traffic assignment.');
}

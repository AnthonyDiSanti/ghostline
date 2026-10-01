import { deploymentStages, type DeploymentHook } from './deployment-hook.js';

export interface HookResponse { hookStatus: 'SUCCEEDED' | 'FAILED' | 'IN_PROGRESS'; callBackDelay?: number }
export async function receiveHook(event: DeploymentHook, service: string,
  invoke: (event: DeploymentHook) => Promise<{ FunctionError?: string; Payload?: Uint8Array }>): Promise<HookResponse> {
  // This receiver owns no rollout state or infrastructure permissions. The serialized controller verifies the exact native revision.
  if (!event || !event.executionId || !deploymentStages.includes(event.lifecycleStage)
    || event.executionDetails?.serviceArn !== service || !event.resourceArn?.startsWith(service.replace(':service/', ':service-deployment/') + '/')) {
    throw new Error('Unexpected native deployment callback.');
  }
  let response;
  try { response = await invoke(event); }
  catch (error) {
    // A busy controller or lost invocation acknowledgement is pending work, never evidence that green failed.
    const failure = error as NodeJS.ErrnoException;
    if (['TooManyRequestsException', 'TimeoutError'].includes(failure.name) || ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(failure.code ?? '')) {
      return { hookStatus: 'IN_PROGRESS', callBackDelay: 5 };
    }
    throw error;
  }
  if (response.FunctionError) throw new Error('Regional deployment controller failed; inspect its diagnostic log.');
  const result = JSON.parse(Buffer.from(response.Payload ?? []).toString('utf8')) as HookResponse;
  if (!['SUCCEEDED', 'FAILED', 'IN_PROGRESS'].includes(result.hookStatus)) throw new Error('Controller returned an invalid hook response.');
  return result.hookStatus === 'IN_PROGRESS' ? { hookStatus: result.hookStatus, callBackDelay: 5 } : { hookStatus: result.hookStatus };
}

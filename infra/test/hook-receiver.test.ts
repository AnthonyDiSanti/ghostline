import { expect, it, vi } from 'vitest';
import { receiveHook } from '../lib/releases/hook-receiver.js';
import type { DeploymentHook } from '../lib/releases/deployment-hook.js';
const service = 'arn:aws:ecs:eu-west-1:000000000000:service/cluster/gateway';
const event: DeploymentHook = { executionId: 'native', lifecycleStage: 'PRE_SCALE_UP',
  resourceArn: service.replace(':service/', ':service-deployment/') + '/deployment',
  executionDetails: { serviceArn: service, targetServiceRevisionArn: 'revision', productionTrafficWeights: {} } };

it.each(['SUCCEEDED', 'FAILED', 'IN_PROGRESS'])('forwards the serialized controller response %s', async hookStatus => {
  const invoke = vi.fn(async () => ({ Payload: Buffer.from(JSON.stringify({ hookStatus })) }));
  expect(await receiveHook(event, service, invoke)).toEqual({ hookStatus, ...(hookStatus === 'IN_PROGRESS' ? { callBackDelay: 5 } : {}) });
  expect(invoke).toHaveBeenCalledExactlyOnceWith(event);
});
it('reports controller concurrency saturation and lost acknowledgements as pending without another invocation', async () => {
  for (const failure of [Object.assign(new Error('busy'), { name: 'TooManyRequestsException' }),
    Object.assign(new Error('timeout'), { name: 'TimeoutError' }), Object.assign(new Error('reset'), { code: 'ECONNRESET' })]) {
    const invoke = vi.fn(async () => { throw failure; });
    expect(await receiveHook(event, service, invoke)).toEqual({ hookStatus: 'IN_PROGRESS', callBackDelay: 5 });
    expect(invoke).toHaveBeenCalledTimes(1);
  }
});
it('rejects foreign callbacks and preserves genuine controller or permission failures', async () => {
  const invoke = vi.fn(async () => ({ FunctionError: 'Unhandled' }));
  await expect(receiveHook({ ...event, resourceArn: 'foreign' }, service, invoke)).rejects.toThrow('Unexpected');
  expect(invoke).not.toHaveBeenCalled();
  await expect(receiveHook(event, service, invoke)).rejects.toThrow('controller failed');
  await expect(receiveHook(event, service, async () => { throw new Error('denied'); })).rejects.toThrow('denied');
  await expect(receiveHook(event, service, async () => ({ Payload: Buffer.from('{}') }))).rejects.toThrow('invalid');
});

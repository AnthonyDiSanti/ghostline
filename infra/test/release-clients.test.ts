import { expect, it, vi } from 'vitest';
import { DescribeServicesCommand, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { retryObservations } from '../lib/releases/clients.js';

it('recovers a read-only socket reset without retrying a force-deployment mutation', async () => {
  const reset = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
  const send = vi.fn().mockRejectedValueOnce(reset).mockResolvedValue({ services: [] });
  const client = retryObservations({ send }, async () => {});
  await expect(client.send(new DescribeServicesCommand({ services: ['gateway'] }))).resolves.toEqual({ services: [] });
  expect(send).toHaveBeenCalledTimes(2);
  send.mockReset().mockRejectedValue(reset);
  await expect(client.send(new UpdateServiceCommand({ service: 'gateway', forceNewDeployment: true }))).rejects.toBe(reset);
  expect(send).toHaveBeenCalledTimes(1);
});
it('bounds read retries and does not suppress permission failures', async () => {
  const send = vi.fn().mockRejectedValue(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  const client = retryObservations({ send }, async () => {});
  await expect(client.send(new DescribeServicesCommand({ services: ['gateway'] }))).rejects.toThrow('reset');
  expect(send).toHaveBeenCalledTimes(3);
  send.mockReset().mockRejectedValue(new Error('denied'));
  await expect(client.send(new DescribeServicesCommand({ services: ['gateway'] }))).rejects.toThrow('denied');
  expect(send).toHaveBeenCalledTimes(1);
});

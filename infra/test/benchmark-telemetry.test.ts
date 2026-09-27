import { describe, expect, it } from 'vitest';
import { hostSample } from '../lib/benchmark/telemetry.js';
describe('short-trial host telemetry', () => {
  const host = { Reservations: [{ Instances: [{ InstanceId: 'i-test', InstanceType: 't4g.small', ImageId: 'ami-test' }] }] };
  it('never interprets absent or denied metric points as zero load', () => {
    const sample = hostSample('i-test', new Date(), args => { if (args[0] === 'ec2') return host; throw new Error('denied'); });
    expect(sample.metrics).toBe('pending-or-unavailable'); expect(sample.cpuMaximumPercent).toBeUndefined();
  });
  it('excludes old points and reports actual peaks and credit exhaustion', () => {
    const start = new Date(Date.now() - 60_000);
    const sample = hostSample('i-test', start, args => args[0] === 'ec2' ? host : { Datapoints: [
      { Timestamp: new Date(0).toISOString(), Maximum: 100, Minimum: 0 },
      { Timestamp: start.toISOString(), Maximum: 8, Minimum: 0 },
    ] });
    expect(sample).toMatchObject({ cpuMaximumPercent: 8, cpuCreditMinimum: 0, metrics: 'observed' });
  });
});

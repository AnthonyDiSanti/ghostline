import { expect, it } from 'vitest';
import { assertInstanceMemory, ecsMemoryBudget } from '../lib/ecs-memory.js';

it('shares the configured small host budget without double-counting platform loss', () => {
  expect(ecsMemoryBudget('t4g.small')).toEqual({ advertised: 2048, platform: 256, baseline: 512, task: 1126, reserved: 666 });
});

it('scales the host baseline and preserves capacity across supported larger sizes', () => {
  for (const size of ['small', 'medium', 'large', 'xlarge', '2xlarge']) {
    const b = ecsMemoryBudget(`t4g.${size}`);
    expect(b.task + b.reserved + b.platform).toBe(b.advertised);
    expect(b.reserved).toBeGreaterThanOrEqual(b.baseline);
    expect(Number.isInteger(b.task)).toBe(true);
    expect(b.baseline).toBe(Math.ceil(Math.max(512, b.advertised * 0.10)));
    expect(() => assertInstanceMemory(`t4g.${size}`, b.advertised)).not.toThrow();
  }
});

it('refuses unknown, undersized and mismatched AWS capacity before deployment', () => {
  for (const type of ['t4g.nano', 't4g.micro']) expect(() => ecsMemoryBudget(type)).toThrow('below');
  expect(() => ecsMemoryBudget('m7g.small')).toThrow('Unsupported');
  expect(() => assertInstanceMemory('t4g.small', 4096)).toThrow('differs');
  expect(() => assertInstanceMemory('t4g.small', undefined)).toThrow('differs');
});

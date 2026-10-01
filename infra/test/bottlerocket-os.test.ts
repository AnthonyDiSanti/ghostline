import { expect, it } from 'vitest';
import { verifyOfficialBottlerocketImage } from '../lib/bottlerocket-os.js';

it('accepts only official metadata for the selected stable OS variant and architecture', () => {
  const image = { owner: 'amazon', architecture: 'arm64', state: 'available', name: 'bottlerocket-aws-ecs-3-aarch64-v1.65.0-0be31b34' };
  expect(() => verifyOfficialBottlerocketImage(image, '1.65.0-0be31b34')).not.toThrow();
  for (const change of [{ owner: 'other' }, { architecture: 'x86_64' }, { name: 'unrelated' }, { state: 'pending' }]) {
    expect(() => verifyOfficialBottlerocketImage({ ...image, ...change }, '1.65.0-0be31b34')).toThrow('official');
  }
});

import { describe, expect, it } from 'vitest';
import { validateGlobalTags } from '../lib/config.js';

describe('cost tags', () => {
  const tags = { Project: 'ghostline', Environment: 'prod' };
  it('preserves global dimensions and allows additional descriptive tags', () => {
    expect(validateGlobalTags({ ...tags, Owner: 'Anthony' })).toEqual({ ...tags, Owner: 'Anthony' });
  });
  it.each(['System', 'system', 'SYSTEM', 'aws:thing', ''])('rejects reserved or empty key %s', (key) => {
    expect(() => validateGlobalTags({ ...tags, [key]: 'override' })).toThrow('tag key');
  });
  it('requires exact billing dimensions and nonempty values', () => {
    expect(() => validateGlobalTags({ project: 'ghostline', Environment: 'prod' })).toThrow('Project');
    expect(() => validateGlobalTags({ ...tags, Project: ' ' })).toThrow('non-empty');
  });
});

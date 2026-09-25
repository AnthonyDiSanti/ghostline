import { expect, it } from 'vitest';
import { selectedOsUpdate } from '../lib/platform-update.js';

it('separates current rollout selection from a qualified native OS update', () => {
  const status = { most_recent_command: { cmd_status: 'Success' }, update_state: 'Available',
    active_partition: { image: { version: '1.64.0' } }, chosen_update: { version: '1.65.0' } };
  expect(selectedOsUpdate(status, ['1.64.0', '1.65.0'])).toBe('1.65.0');
  expect(() => selectedOsUpdate(status, ['1.64.0'])).toThrow('qualification');
  expect(selectedOsUpdate({ ...status, chosen_update: { version: '1.64.0' } }, ['1.64.0'])).toBeUndefined();
  expect(selectedOsUpdate({ ...status, chosen_update: undefined, update_state: 'Idle' }, ['1.64.0'])).toBeUndefined();
  expect(() => selectedOsUpdate({ ...status, most_recent_command: { cmd_status: 'Failed' } }, ['1.65.0'])).toThrow('discovery');
});

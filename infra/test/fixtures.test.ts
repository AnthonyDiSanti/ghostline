import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { renderFixture } from '../lib/fixtures.js';

it('requires exact fixture inputs and preserves shell syntax without recursive interpolation', () => {
  const file = new URL('./fixtures/render.sh', import.meta.url);
  const value = '$& $1 ${value} @@OTHER@@';
  expect(renderFixture(file, { VALUE: value })).toBe(readFileSync(file, 'utf8').split('@@VALUE@@').join(value));
  expect(() => renderFixture(file)).toThrow('Missing fixture value: VALUE');
  expect(() => renderFixture(file, { VALUE: 'ok', OTHER: 'unused' })).toThrow('Unused fixture values');
});

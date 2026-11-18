import { expect, it } from 'vitest';
import { derpPublicIdentity, generateDerpIdentity } from '../lib/derp-identity.js';

it('generates a standard-SecureString-sized IP identity and validates its exact key/certificate pairing', () => {
  // All identities are synthetic and remain inside this process; assertions expose public metadata only.
  const first = generateDerpIdentity('192.0.2.10'), second = generateDerpIdentity('192.0.2.10');
  const metadata = derpPublicIdentity(first, '192.0.2.10');
  expect(Buffer.byteLength(first)).toBeLessThanOrEqual(4096);
  expect(metadata.ip).toBe('192.0.2.10'); expect(metadata.pin).toMatch(/^sha256-raw:[a-f0-9]{64}$/);
  expect(derpPublicIdentity(second).pin === metadata.pin).toBe(false);
  for (const invalid of [JSON.stringify({ ...JSON.parse(first), privateKey: JSON.parse(second).privateKey }),
    JSON.stringify({ ...JSON.parse(first), ip: '192.0.2.11' }), JSON.stringify({ ...JSON.parse(first), serverKey: 'privkey:' + '0'.repeat(64) }),
    JSON.stringify({ ...JSON.parse(first), extra: true }), '{SYNTHETIC_PRIVATE_MARKER']) {
    expect(() => derpPublicIdentity(invalid)).toThrow('contents withheld');
  }
  expect(() => derpPublicIdentity(first, '192.0.2.11')).toThrow('contents withheld');
  expect(() => derpPublicIdentity(first, undefined, new Date(Date.now() + 366 * 86400_000))).toThrow('contents withheld');
});

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import settings from '../../runtime/ecs/dns-policy.json' with { type: 'json' };

test('CoreDNS uses only host-allowed encrypted upstreams and blocks the retired onion route', () => {
  // The Corefile and host firewall must agree before any candidate can be built.
  const corefile = readFileSync(new URL('../../runtime/ecs/dns-policy.Corefile', import.meta.url), 'utf8');
  const destinations = [...corefile.matchAll(/tls:\/\/([0-9.]+)%([a-z.]+)/g)].map(([, address, tlsName]) => ({ address, tlsName }));
  expect(destinations).toEqual(settings.upstreams);
  expect(corefile).toContain('template ANY ANY onion {');
  expect(corefile).toContain('rcode NXDOMAIN');
  expect(corefile).toContain('failfast_all_unhealthy_upstreams');
  expect(corefile).toContain('policy sequential');
  expect(corefile).not.toMatch(/(?:dns|https):\/\//);
});

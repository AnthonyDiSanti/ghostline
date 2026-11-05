import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('closes forwarding before changing source identities and filters unconfigured/host traffic', () => {
  // Execute the real Python policy builder with a fake command boundary; live packet checks are separate.
  const script = fileURLToPath(new URL('./fixtures/ecs-network-policy.py', import.meta.url));
  const result = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(result.nat).toContain('-s 172.17.0.2/32 -o ens5 -j SNAT --to-source 10.79.0.11');
  expect(result.nat).toContain('-s 172.17.0.3/32 -o ens5 -j SNAT --to-source 10.79.0.10');
  expect(result.rules).toContain('-i docker0 -d 169.254.0.0/16 -j DROP');
  expect(result.rules).toContain('-i docker0 -o docker0 -j DROP');
  expect(result.empty.every((line: string) => !line.includes('ACCEPT'))).toBe(true);
  expect(result.empty.slice(-3)).toEqual(['-i docker0 -j DROP', '-o docker0 -j DROP', '-j RETURN']);
});

it('allows one leased DNS peer with shared DoT egress and fails closed when DNS disappears', () => {
  // DNS follows the host's primary address, independently of either engine's application traffic.
  const script = fileURLToPath(new URL('./fixtures/ecs-network-policy.py', import.meta.url));
  const result = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(result.sharedNat).toContain('-s 172.17.0.4/32 -o ens5 -j SNAT --to-source 10.79.0.10');
  expect(result.sharedNat).not.toContain('-s 172.17.0.4/32 -o ens5 -j SNAT --to-source 10.79.0.11');
  expect(result.otherPrimaryNat).toContain('-s 172.17.0.4/32 -o ens5 -j SNAT --to-source 10.79.0.12');
  expect(result.sharedNat).toContain('-s 172.17.0.3/32 -o ens5 -j SNAT --to-source 10.79.0.10');
  expect(result.sharedRules).toContain('-i docker0 -o docker0 -s 172.17.0.2/32 -d 172.17.0.4/32 -p udp --dport 5353 -j ACCEPT');
  expect(result.sharedRules).toContain('-i docker0 -o docker0 -s 172.17.0.4/32 -d 172.17.0.3/32 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
  expect(result.sharedRules).toContain('-i docker0 -s 172.17.0.4/32 -o ens5 -d 1.1.1.1/32 -p tcp --dport 853 -j ACCEPT');
  expect(result.sharedRules).toContain('-i docker0 -s 172.17.0.4/32 -o ens5 -d 8.8.8.8/32 -p tcp --dport 853 -j ACCEPT');
  // Pending ECS tasks may forward only the authenticated DNS peer needed to become healthy.
  expect(result.pendingDnsNat).toEqual(['-s 172.17.0.4/32 -o ens5 -j SNAT --to-source 10.79.0.10', '-j RETURN']);
  expect(result.pendingDnsRules.filter((rule: string) => rule.endsWith('-j ACCEPT') && rule.includes('-o ens5')))
    .toEqual(['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4'].map(address =>
      `-i docker0 -s 172.17.0.4/32 -o ens5 -d ${address}/32 -p tcp --dport 853 -j ACCEPT`));
  expect(result.sharedRules.filter((rule: string) => rule.includes('-s 172.17.0.4/32 -o ens5') && rule.endsWith('-j ACCEPT')))
    .toEqual(['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4'].map(address =>
      `-i docker0 -s 172.17.0.4/32 -o ens5 -d ${address}/32 -p tcp --dport 853 -j ACCEPT`));
  expect(result.sharedRules.indexOf('-i docker0 -o docker0 -j DROP')).toBeGreaterThan(
    result.sharedRules.indexOf('-i docker0 -o docker0 -s 172.17.0.2/32 -d 172.17.0.4/32 -p udp --dport 5353 -j ACCEPT'));
  expect(result.missingDnsRules).toContain('-i docker0 -s 172.17.0.2/32 -o ens5 -p udp --dport 53 -j DROP');
  expect(result.missingDnsRules).not.toContain('-i docker0 -s 172.17.0.2/32 -o ens5 -p udp --dport 53 -j ACCEPT');
  expect(result.redirect).toContain('-i docker0 -s 172.17.0.2/32 -p tcp --dport 53 -j DNAT --to-destination 172.17.0.4:5353');
  expect(result.redirect).toContain('-i docker0 -s 172.17.0.3/32 -p udp --dport 53 -j DNAT --to-destination 172.17.0.4:5353');
  expect(result.missingRedirect).toEqual(['-j RETURN']);
  expect(result.coldChains['nat/GHOSTLINE_DNS']).toEqual(['-j RETURN']);
  expect(result.coldChains['raw/GHOSTLINE_INGRESS']).toContain('-i ens5 -p tcp --dport 55353 -j DROP');
  expect(result.coldChains['raw/GHOSTLINE_INGRESS']).toContain('-i ens5 -p udp --dport 55353 -j DROP');
});

it('quarantines only the changing engine and never flushes sibling flows', () => {
  const script = fileURLToPath(new URL('./fixtures/ecs-network-reconcile.py', import.meta.url));
  const results = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(results.cold[0][2].some((rule: string) => rule.includes('ACCEPT'))).toBe(false);
  for (const scenario of ['restart', 'remove', 'move']) {
    const calls = results[scenario];
    const initial = calls[0][2] as string[];
    expect(initial.some(rule => rule.includes('172.17.0.2/32') && rule.includes('ACCEPT'))).toBe(true);
    expect(initial.some(rule => rule.includes('172.17.0.3/32') && rule.includes('ACCEPT'))).toBe(false);
    const cleanup = calls.filter((call: string[]) => call[0] === 'conntrack');
    expect(cleanup).toContainEqual(['conntrack', '-D', '--orig-src', '172.17.0.3']);
    expect(cleanup).toContainEqual(['conntrack', '-D', '--reply-src', '172.17.0.3']);
    expect(cleanup.flat()).not.toContain('172.17.0.2');
    expect(cleanup.flat()).not.toContain('172.17.0.0/16');
    if (scenario === 'move') expect(cleanup).toContainEqual(['conntrack', '-D', '--orig-src', '172.17.0.4']);
    expect(calls.some((call: string[]) => call.includes('DOCKER-USER') || call.includes('POSTROUTING'))).toBe(false);
  }
});

it('discovers exact gateway engines and catches restart generations and ambiguous peers', () => {
  const script = fileURLToPath(new URL('./fixtures/ecs-network-discovery.py', import.meta.url));
  const result = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(result.initial.xray).toEqual(result.restart.xray);
  expect(result.initial.awg.id).toBe(result.restart.awg.id);
  expect(result.initial.awg.started).not.toBe(result.restart.awg.started);
  expect(result['not-running']).toEqual({});
  expect(result['no-address']).toEqual({ xray: result.initial.xray });
  for (const scenario of ['duplicate', 'foreign-network', 'same-address']) expect(result[scenario]).toBe(false);
});

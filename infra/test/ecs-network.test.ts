import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('closes forwarding before changing source identities and filters unconfigured/host traffic', () => {
  // Execute the real Python policy builder with a fake command boundary; live packet checks are separate.
  const script = `
import importlib.util,json
spec=importlib.util.spec_from_file_location('network','../runtime/ecs/network.py')
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
c={'interface':'ens5','xray':'10.79.0.11','awg':'10.79.0.10'}
p={'xray':{'ip':'172.17.0.2','id':'x'},'awg':{'ip':'172.17.0.3','id':'a'}}
rules,nat=n.policy(c,p)
empty,_=n.policy(c,{})
print(json.dumps({'rules':rules,'nat':nat,'empty':empty}))
`;
  const result = JSON.parse(execFileSync('python3', ['-B', '-c', script], { encoding: 'utf8' }));
  expect(result.nat).toContain('-s 172.17.0.2/32 -o ens5 -j SNAT --to-source 10.79.0.11');
  expect(result.nat).toContain('-s 172.17.0.3/32 -o ens5 -j SNAT --to-source 10.79.0.10');
  expect(result.rules).toContain('-i docker0 -d 169.254.0.0/16 -j DROP');
  expect(result.rules).toContain('-i docker0 -o docker0 -j DROP');
  expect(result.empty.every((line: string) => !line.includes('ACCEPT'))).toBe(true);
  expect(result.empty.slice(-3)).toEqual(['-i docker0 -j DROP', '-o docker0 -j DROP', '-j RETURN']);
});

it('keeps forwarding closed through source-rule and conntrack replacement', () => {
  const script = `
import importlib.util,json,contextlib,io
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('network','../runtime/ecs/network.py')
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
c={'interface':'ens5','xray':'10.79.0.11','awg':'10.79.0.10'}
p={'xray':{'ip':'172.17.0.2','id':'x'}}
calls=[]
n.replace_chain=lambda table,chain,rules:calls.append([table,chain,rules])
n.command=lambda args:calls.append(args)
with patch.object(n.subprocess,'run',lambda *a,**kw:calls.append(['conntrack'])),patch.object(n.Path,'write_text'),contextlib.redirect_stdout(io.StringIO()):
 n.reconcile(c,p)
print(json.dumps(calls))
`;
  const calls = JSON.parse(execFileSync('python3', ['-B', '-c', script], { encoding: 'utf8' }));
  expect(calls[0][2].some((rule: string) => rule.includes('ACCEPT'))).toBe(false);
  expect(calls[1][0]).toBe('nat');
  expect(calls[2]).toEqual(['conntrack']);
  expect(calls.at(-1)[2].some((rule: string) => rule.includes('ACCEPT'))).toBe(true);
  expect(calls.some((call: string[]) => call.includes('DOCKER-USER'))).toBe(false);
});

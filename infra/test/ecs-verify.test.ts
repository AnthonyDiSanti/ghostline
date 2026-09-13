import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('requires working HTTPS before proving metadata isolation and rejects unexpected probe failures', () => {
  // Exercise the real namespace probe with mocked sockets, including failures that must not count as isolation.
  const script = `
import importlib.util,io,contextlib,json,sys
from unittest.mock import patch,MagicMock
spec=importlib.util.spec_from_file_location('verify','../runtime/ecs/verify.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
results=[]
class LegacySocketTimeout(OSError): pass
for mode in ['blocked','metadata-open','https-failed','socket-failed']:
 connection=MagicMock()
 connection.getresponse.return_value.status=500 if mode=='https-failed' else 200
 connection.getresponse.return_value.read.return_value=b'198.51.100.1\\n'
 def connect(address,**kw):
  if address[0]=='169.254.169.254':
   if mode=='metadata-open': return MagicMock()
   if mode=='socket-failed': raise OSError('unexpected failure')
   raise LegacySocketTimeout()
  return MagicMock()
 output=io.StringIO()
 with patch('socket.timeout',LegacySocketTimeout),patch('socket.create_connection',connect),patch('ssl.create_default_context'),patch('http.client.HTTPSConnection',return_value=connection),patch.object(sys,'argv',['probe','198.51.100.2']),contextlib.redirect_stdout(output):
  try:
   exec(v.NETWORK_PROBE, {})
   results.append({'mode':mode,'passed':True,'evidence':json.loads(output.getvalue())})
  except Exception:
   results.append({'mode':mode,'passed':False})
print(json.dumps(results))
`;
  const results = JSON.parse(execFileSync('python3', ['-B', '-c', script], { encoding: 'utf8' }));
  expect(results).toEqual([
    { mode: 'blocked', passed: true, evidence: { publicIp: '198.51.100.1', metadataBlocked: true } },
    { mode: 'metadata-open', passed: false },
    { mode: 'https-failed', passed: false },
    { mode: 'socket-failed', passed: false },
  ]);
});

#!/usr/bin/env python3
"""Mock only external sockets; run the production probe and preserve its failure semantics."""
import runpy
from pathlib import Path
import importlib.util
import io
import contextlib
import json
import sys
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('verify', Path(__file__).resolve().parents[3] / 'runtime/ecs/verify.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
results = []

class LegacySocketTimeout(OSError):
    pass
for mode in ['blocked', 'metadata-open', 'https-failed', 'socket-failed']:
    connection = MagicMock()
    connection.getresponse.return_value.status = 500 if mode == 'https-failed' else 200
    connection.getresponse.return_value.read.return_value = b'198.51.100.1\n'

    def connect(address, **kw):
        if address[0] == '169.254.169.254':
            if mode == 'metadata-open':
                return MagicMock()
            if mode == 'socket-failed':
                raise OSError('unexpected failure')
            raise LegacySocketTimeout()
        return MagicMock()
    output = io.StringIO()
    with patch('socket.timeout', LegacySocketTimeout), patch('socket.create_connection', connect), patch('ssl.create_default_context'), patch('http.client.HTTPSConnection', return_value=connection), patch.object(sys, 'argv', ['probe', '198.51.100.2']), contextlib.redirect_stdout(output):
        try:
            runpy.run_path(str(Path(v.__file__).with_name('network-probe.py')), run_name='__main__')
            results.append({'mode': mode, 'passed': True, 'evidence': json.loads(output.getvalue())})
        except Exception:
            results.append({'mode': mode, 'passed': False})
print(json.dumps(results))

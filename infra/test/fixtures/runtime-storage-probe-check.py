#!/usr/bin/env python3
"""Behavioral checks for the bounded native scanner, using disposable synthetic bytes."""
import importlib.util
import base64
import json
import tempfile
from pathlib import Path


def main():
    # Keep synthetic values out of success/failure output, like the native probe itself.
    spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('runtime-storage-probe.py'))
    probe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(probe)
    secret = 'synthetic\n"credential"'
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        (root / 'checkpoint.json').write_text(json.dumps({'environment': {'SECRET': secret}}))
        (root / 'ordinary').write_text('operational-only')
        (root / 'ignored-link').symlink_to(root / 'checkpoint.json')
        report = probe.scan(root, {'secret': probe.variants(secret)})
        assert report['complete'] and report['matchedFiles'] == {'secret': 1} and report['filesScanned'] == 2
        bounded = probe.scan(root, {'secret': probe.variants(secret)}, max_bytes=1)
        assert not bounded['complete'] and bounded['bytesScanned'] == 0
        assert not probe.scan(root / 'missing', {'secret': probe.variants(secret)})['complete']
        for offset in range(3):
            (root / 'encoded').write_bytes(base64.b64encode(b'x' * offset + secret.encode() + b'suffix'))
            assert probe.scan(root, {'secret': probe.variants(secret)})['matchedFiles']['secret'] == 2
        for name in ['xray', 'awg', 'derp']:
            (root / name).mkdir()
        (root / 'xray/server.json').write_text(json.dumps({'settings': {'clients': [{'id': 'synthetic-client-identifier'}]}, 'privateKey': secret}))
        (root / 'awg/awg0.conf').write_text('[Interface]\nPrivateKey = synthetic-private-key\n[Peer]\nPresharedKey = synthetic-shared-key\n')
        (root / 'derp/derper.json').write_text(json.dumps({'PrivateKey': 'synthetic-relay-key'}))
        assert probe.ram_values(root) == {'xray': {'synthetic-client-identifier', secret},
                                          'awg': {'synthetic-private-key', 'synthetic-shared-key'}, 'derp': {'synthetic-relay-key'}}
    print(json.dumps({'passed': True}))


if __name__ == '__main__':
    main()

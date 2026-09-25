#!/usr/bin/env python3
"""Validate actual local descriptors and nonblocking bootstrap observation failures."""
import contextlib
import io
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'runtime/ecs/bottlerocket'))
import boot_observation as boot  # noqa: E402

source = 'example/ghostline/prod/bootstrap:keep-production'
sha = 'sha256:' + 'a' * 64
row = f'{source} application/vnd.oci.image.index.v1+json {sha} 33.2 MiB linux/arm64 -'
assert boot.image_digest({'Image': source}, row) == sha
for listing in ['', row + '\n' + row, row.replace(sha, 'not-a-digest')]:
    try:
        boot.image_digest({'Image': source}, listing)
    except RuntimeError:
        continue
    raise AssertionError('Ambiguous or absent descriptor accepted')
with patch.object(boot, 'record_boot', side_effect=RuntimeError('unavailable registry or API')), contextlib.redirect_stdout(io.StringIO()) as output:
    boot.observe_boot()
assert 'boot continues' in output.getvalue()
assert 'unavailable registry or API' not in output.getvalue()

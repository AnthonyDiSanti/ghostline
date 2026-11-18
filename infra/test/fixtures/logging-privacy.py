#!/usr/bin/env python3
"""Regression checks for local log summarization and diagnostic error redaction."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
PLATFORM = HERE.parents[2] / 'runtime/ecs/bottlerocket'
sys.path.insert(0, str(PLATFORM))
sys.path.insert(0, str(PLATFORM.parent))


def load(name, path):
    # Import the real implementation without invoking host operations or its CLI entrypoint.
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


probe = load('logging_audit', HERE / 'logging-audit.py')
marker = 'SYNTHETIC_PRIVATE_MARKER'
summary = probe.summarize('from 1.1.1.1 accepted tcp:private.example:443\n[ERROR] plugin/errors: 2 private.example. A: timeout')
assert summary['publicIpLineCount'] == 1
assert summary['xrayAccessRecordCount'] == 1
assert summary['dnsQuestionRecordCount'] == 1
assert 'private.example' not in json.dumps(summary) and '1.1.1.1' not in json.dumps(summary)
assert probe.secret_entries(['GHOSTLINE_XRAY_BUNDLE=', f'GHOSTLINE_AWG_BUNDLE={marker}', 'OTHER=value']) == 1
for module in (load('daemon', PLATFORM / 'daemon.py'), load('host_support', PLATFORM / 'host_support.py'), probe):
    # Captured process errors must not leak tool output/addresses into Python traceback or SSM output.
    with patch.object(module.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout=marker, stderr=marker)):
        try:
            module.command(['ip', 'address']) if hasattr(module, 'command') else module.run(['docker', 'logs'])
            raise AssertionError('Expected subprocess failure')
        except RuntimeError as error:
            assert marker not in str(error)
    # Timeouts and process-launch exceptions can quote their original arguments without stderr.
    for failure in (subprocess.TimeoutExpired(['ip', marker], 3), OSError(marker)):
        with patch.object(module.subprocess, 'run', side_effect=failure):
            try:
                module.command(['ip', marker]) if hasattr(module, 'command') else module.run(['docker', marker])
                raise AssertionError('Expected subprocess failure')
            except RuntimeError as error:
                assert marker not in str(error) and error.__suppress_context__
print(json.dumps({'summarizationRedacted': True, 'errorsRedacted': True}))

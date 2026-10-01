#!/usr/bin/env python3
"""Exercise slot-aware daemon selection without granting diagnostic authority."""
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'runtime/ecs/bottlerocket'))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'runtime/ecs'))
import diagnostics


def select(members):
    # Model Docker's exact label intersection, including unrelated families and container names.
    def command(args):
        family = next(arg.split('=', 2)[2] for arg in args if arg.startswith('label=com.amazonaws.ecs.task-definition-family='))
        assert 'label=com.amazonaws.ecs.container-name=network' in args
        return '\n'.join(identity for candidate, name, identity in members if candidate == family and name == 'network')
    with patch.object(diagnostics, 'command', command):
        return diagnostics.daemon_identity({'family': 'ghostline-test'})


for suffix in ('', '-b'):
    assert select([(f'ghostline-test-network{suffix}', 'network', 'selected'),
                   ('foreign-network', 'network', 'foreign'),
                   (f'ghostline-test-network{suffix}', 'foreign', 'wrong-container')]) == 'selected'
for members in ([], [('ghostline-test-network', 'network', 'a'), ('ghostline-test-network-b', 'network', 'b')]):
    try:
        select(members)
    except RuntimeError:
        pass
    else:
        raise AssertionError('Missing or ambiguous daemon must fail closed')
print('Both slot diagnostic identities and ambiguity rejection passed')

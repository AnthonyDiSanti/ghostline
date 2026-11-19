#!/usr/bin/env python3
"""Exercise volume identity discovery and non-destructive configuration replay without host mutations."""
import importlib.util
import os
from pathlib import Path
import tempfile


def main():
    # Load the maintained runtime helper without entering its privileged main function.
    source = Path(__file__).resolve().parents[3] / 'runtime/ecs/headscale-host.py'
    spec = importlib.util.spec_from_file_location('coordinator', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        serial = root / 'sys/nvme9n1/device'
        serial.mkdir(parents=True)
        serial.joinpath('serial').write_text('vol0123456789abcdef0\n')
        serial.parent.joinpath('dev').write_text('259:17\n')
        assert module.find_device('vol-0123456789abcdef0', root / 'sys') == {'name': 'nvme9n1', 'major': 259, 'minor': 17}
        assert module.find_device('vol-11111111111111111', root / 'sys') is None
        node = root / 'ghostline-headscale'
        node.write_text('not a block device')
        try:
            module.private_device({'major': 259, 'minor': 17}, root)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Regular file accepted as a block device')
        node.unlink()
        node.symlink_to(root / 'outside')
        try:
            module.private_device({'major': 259, 'minor': 17}, root)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Device symlink was accepted')
        # New EBS bytes need not be zero; an explicit permission is required and known signatures always prohibit formatting.
        module.require_initialization_permission([], True)
        for signatures, permission in [([], False), ([], None), ([{'type': 'ext4'}], True)]:
            try:
                module.require_initialization_permission(signatures, permission)
            except RuntimeError:
                pass
            else:
                raise AssertionError('Unsafe filesystem initialization was permitted')
        module.MOUNT = root / 'data'
        (module.MOUNT / 'config').mkdir(parents=True)
        module.os.chown = lambda *_args: None
        files = {'config.yaml': 'initial', 'derp.yaml': 'map', 'policy.json': '{"acls":[]}'}
        module.write_configuration(files, initialize=True)
        module.write_configuration({**files, 'config.yaml': 'boot-replay'}, initialize=True)
        assert (module.MOUNT / 'config/config.yaml').read_text() == 'initial'
        (module.MOUNT / 'config/policy.json').write_text('operator-policy')
        module.write_configuration({**files, 'config.yaml': 'updated'})
        assert (module.MOUNT / 'config/config.yaml').read_text() == 'updated'
        assert (module.MOUNT / 'config/policy.json').read_text() == 'operator-policy'
        (module.MOUNT / 'config/config.yaml').unlink()
        (module.MOUNT / 'config/config.yaml').symlink_to(root / 'outside')
        try:
            module.write_configuration(files)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Configuration symlink was accepted')
        assert not (root / 'outside').exists()
        identity = root / 'identity'
        identity.write_text('disposable synthetic identity')
        identity.chmod(0o600)
        owner = (os.getuid(), os.getgid())
        assert len(module.fingerprint_private_file(identity, owner)) == 64
        identity.chmod(0o644)
        try:
            module.fingerprint_private_file(identity, owner)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Non-private identity file accepted')
        identity.unlink()
        identity.symlink_to(root / 'elsewhere')
        try:
            module.fingerprint_private_file(identity, owner)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Identity symlink accepted')
    print('Coordinator storage guards passed')


if __name__ == '__main__':
    main()

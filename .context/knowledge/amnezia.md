# Amnezia reference integration

Consult before retrying client/server installation. Sources: official [requirements](https://docs.amnezia.org/documentation/supported-linux-os-for-vps/), [setup](https://docs.amnezia.org/documentation/instructions/install-vpn-on-server/), [5.0.1.5 source](https://github.com/amnezia-vpn/amnezia-client/tree/5.0.1.5). Launch evidence lives in `docs/launch.md`.

- Ubuntu 24.04 x86_64 and passwordless-sudo `ubuntu` work with the installer. Select Manual → XRay; Automatic selects AmneziaWG.
- macOS 5.0.1.5 initially inherited `TMPDIR=/private/tmp/PKInstallSandbox.3VQHwF/tmp` when launched by the package installer. Server preparation created Docker, then local upload failed with ErrorCode 1200. Source `client/core/utils/selfhosted/sshSession.cpp` creates a QTemporaryFile for uploads; process environment exposed the stale installer directory. Quit and relaunch normally before retrying. Do not change directory permissions or bypass signing.
- CUA Qt accessibility labels are sparse; use screenshots to identify protocol cards and verify the resulting screen before starting installation.
- Paste SSH material into the secure field without printing it, then clear the clipboard. LastPass computer-use permission was denied; Anthony explicitly offered to intermediate all vault activity. Prepare local ignored artifacts and provide paths/item names.

- Actual XRay source `client/core/protocols/xrayProtocol.cpp` calls `StopRoutingIpv6` on connect and restores routing on stop. GUI exposes Soft KillSwitch, enabled in this setup; native IPv6 remains unverified because the tested network lacks successful IPv6-only resolution.
- SSH to the endpoint times out while the Mac tunnel is connected; disconnect before Amnezia server administration. Do not broaden the AWS SSH range to diagnose client routing.

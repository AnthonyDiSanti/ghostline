# Runtime provenance

Ghostline adapts the server packaging and protocol-parameter decisions from
[AmneziaVPN 5.0.1.5](https://github.com/amnezia-vpn/amnezia-client/tree/5.0.1.5):
`client/server_scripts/{xray,awg}`, `client/core/installers/awgInstaller.cpp`, and
`client/core/utils/constants/protocolConstants.h`.

AmneziaVPN is copyright its upstream contributors and distributed under GPLv3;
the accompanying `LICENSE.amnezia` preserves that license. The adapted AWG
generation in `infra/lib/awg.ts` and runtime recipes follow those terms.
See upstream [third-party terms](https://github.com/amnezia-vpn/amnezia-client/blob/5.0.1.5/THIRD_PARTY_LICENSES.md)
for its dependencies. Ghostline retains upstream protocol implementations;
it does not fork the desktop application.

- Xray-core 26.7.28: official release ZIP, SHA256 verified during build; its
  bundled license is retained in the image at `/usr/bin/LICENSE`.
- Xray container: upstream Alpine 3.15 family, pinned amd64 base. This preserves
  the reference container environment for migration; it is distinct from the
  Ubuntu 24.04 EC2 host. This work is not a distribution upgrade.
- AWG: pinned upstream `amneziavpn/amneziawg-go` amd64 image digest, observed
  Alpine 3.19.9 and `amneziawg-tools v3.1.20260812`. The daemon reports the older
  `0.0.20250522` version string; configuration compatibility is tested directly
  instead of inferring protocol generation from that string.

Local builds contain no server credentials. ECR publication and release/rollback
management are intentionally outside this work unit.

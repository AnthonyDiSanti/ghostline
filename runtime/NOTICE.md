# Runtime provenance

Ghostline adapts the server packaging and protocol-parameter decisions from
[AmneziaVPN 5.0.1.5](https://github.com/amnezia-vpn/amnezia-client/tree/5.0.1.5):
`client/server_scripts/{xray,awg}`, `client/core/installers/awgInstaller.cpp`, and
`client/core/utils/constants/protocolConstants.h`.

AmneziaVPN is copyright its upstream contributors and distributed under GPLv3;
the accompanying `LICENSE.amnezia` preserves that license. The adapted AWG
generation in `infra/lib/awg.ts`, Xray settings in `infra/lib/xray.ts`, and runtime recipes follow those terms.
See upstream [third-party terms](https://github.com/amnezia-vpn/amnezia-client/blob/5.0.1.5/THIRD_PARTY_LICENSES.md)
for its dependencies. Ghostline retains upstream protocol implementations;
it does not fork the desktop application.

- Legacy Xray-core 26.7.28: official release ZIP, SHA256 verified during build; its
  bundled license is retained in the image at `/usr/bin/LICENSE`.
- Legacy Xray container: upstream Alpine 3.15 family, pinned amd64 base. This preserves
  the reference container environment for migration; it is distinct from the
  Ubuntu 24.04 legacy or Amazon Linux 2023 ECS host. This work is not a distribution upgrade.
- ECS Xray: unmodified official `ghcr.io/xtls/xray-core` 26.7.28 amd64 image,
  pinned by digest in `infra/lib/ecs-release.ts` and mirrored to ECR. Upstream
  [Xray source and license](https://github.com/XTLS/Xray-core/tree/v26.7.28)
  remain authoritative. Ghostline no longer rebuilds this engine image.
- ECS configuration initializer: Alpine 3.24.1 pinned by digest, with jq 1.8.2-r0
  and a Ghostline shell adapter. It writes only the engine configuration to a
  protected task volume; the Xray image contains no Ghostline startup adapter.
- AWG: pinned upstream `amneziavpn/amneziawg-go` amd64 image digest, observed
  Alpine 3.19.9 and `amneziawg-tools v3.1.20260812`. The daemon reports the older
  `0.0.20250522` version string; configuration compatibility is tested directly
  instead of inferring protocol generation from that string.

Local builds contain no server credentials. The ECS trial publishes immutable
content-tagged variants to ECR and injects configuration at task startup.
An automated rollback framework remains out of scope.

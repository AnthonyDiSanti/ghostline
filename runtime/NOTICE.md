# Runtime provenance

Ghostline adapts protocol settings and AWG generation from
[AmneziaVPN 5.0.1.5](https://github.com/amnezia-vpn/amnezia-client/tree/5.0.1.5),
including `client/server_scripts/{xray,awg}`, `client/core/installers/awgInstaller.cpp`
and `client/core/utils/constants/protocolConstants.h`.

AmneziaVPN is copyright its upstream contributors and distributed under GPLv3;
`LICENSE.amnezia` preserves that license. The adapted AWG generation in
`infra/lib/awg.ts`, Xray settings in `infra/lib/xray.ts` and startup adapters
follow those terms. See upstream
[third-party terms](https://github.com/amnezia-vpn/amnezia-client/blob/5.0.1.5/THIRD_PARTY_LICENSES.md).

- Xray: unmodified official `ghcr.io/xtls/xray-core` 26.7.28 ARM64 image,
  mirrored to ECR by digest. [Upstream source/license](https://github.com/XTLS/Xray-core/tree/v26.7.28)
  remain authoritative; Ghostline does not rebuild this engine.
- AWG: `ecs/awg.Dockerfile` compiles official daemon v3.1.20260828
  (`b5928efb6ca19f0153958460c3d141f04abc5c2e`) and tools v3.1.20260812
  (`ee0f0a9aa34ff0a0da4b3433b9512781cfe02843`). Source archives and builders
  are checksum/digest-pinned. Each upstream license remains under
  `/usr/share/licenses/`. The Alpine 3.24.1 runtime uses Ghostline's network
  startup and pinned direct packages, without a third-party supervisor.
- Shared initializer: Alpine 3.24.1, jq 1.8.2-r0 and Ghostline's renderers.
  It writes protocol-private RAM files; engines mount their own files read-only.

No image contains server credentials or desktop-client code. Regional ECR
publication uses immutable content identities. [Image policy](../docs/images.md)
distinguishes deployed releases from the selected stable-update follow-up.

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

- Xray: unmodified official `ghcr.io/xtls/xray-core` ARM64 image,
  mirrored to ECR by resolved digest. [Upstream source/license](https://github.com/XTLS/Xray-core)
  remain authoritative; Ghostline does not rebuild this engine.
- AWG: `ecs/awg.Dockerfile` compiles official daemon and tools releases
  recorded in [image inputs](../infra/image-inputs.json). Source archives and builders
  are checksum/digest-pinned. Each upstream license remains under
  `/usr/share/licenses/`. The Alpine 3.24.1 runtime uses Ghostline's network
  startup and pinned direct packages, without a third-party supervisor.
- Shared initializer: Alpine 3.24.1, jq 1.8.2-r0 and Ghostline's renderers.
  The DERP multi-target recipe supplies its static certificate renderer and the direct-to-RAM
  initializer. The latter compiles the official AWS SDK for Go v2 core v1.46.0,
  credentials v1.20.3, SSM v1.77.0 and Smithy v1.28.1 already pinned by the
  selected Tailscale source module/go.sum. AWS SDK and Smithy use Apache 2.0;
  their exact compiled-module notices and the Go runtime license are included
  under `/usr/share/licenses/ghostline-secrets/`. Source terms: [AWS SDK](https://raw.githubusercontent.com/aws/aws-sdk-go-v2/v1.46.0/LICENSE.txt),
  [Smithy](https://raw.githubusercontent.com/aws/smithy-go/v1.28.1/LICENSE).
  Protocol renderers receive private stdin pipes; engines mount their own RAM files read-only.
- DERP/STUN: unmodified `tailscale.com/cmd/derper` from the stable source commit
  recorded in [image inputs](../infra/image-inputs.json), built with that source's
  exact pinned Tailscale Go toolchain. The minimal `scratch` runtime includes CA
  certificates, Ghostline's rendering/health entrypoint and the upstream BSD
  license at `/usr/share/licenses/tailscale/LICENSE`. [Upstream source and terms](https://github.com/tailscale/tailscale/tree/v1.104.7).
- Shared DNS: CoreDNS 1.15.0 official ARM64 binary and CA certificates by pinned
  upstream digest, packaged with a static Ghostline Go health command and
  Corefile in a minimal `scratch` runtime. CoreDNS uses the
  [Apache 2.0 license](LICENSE.coredns), included in the image at
  `/usr/share/licenses/coredns/LICENSE`. Its upstream source remains at
  [coredns/coredns](https://github.com/coredns/coredns). [Scope](../docs/dns.md).

- Host bootstrap: `ecs/bottlerocket/bootstrap.Dockerfile` packages finite RAM/quarantine preparation and separately invoked diagnostics on Alpine 3.24.1, with explicitly versioned tools.
- Network daemon: `ecs/bottlerocket/network-daemon.Dockerfile` packages only continued network/lease reconciliation, without Docker CLI or diagnostic/mount tooling. Both join the same whole-stack release pipeline. [Native qualification](../infra/platform-qualification.json) identifies qualified runtime bytes; AWS's official Bottlerocket AMI supplies the verified host OS/ECS agent and control container under their upstream terms.
- Headscale coordinator: mirror the unchanged official ARM64 `ghcr.io/juanfont/headscale` application selected from latest stable on each explicit deployment. Headscale is copyright Juan Font and contributors under [BSD 3-Clause](LICENSE.headscale); [upstream source](https://github.com/juanfont/headscale) owns application provenance. `ecs/headscale-host.Dockerfile` separately packages Ghostline's finite volume/diagnostic helper with pinned Alpine 3.24.1 and direct tool versions. These two coordinator repositories are independent of the gateways' seven-image release contract. [Deployment and observed versions](../docs/headscale.md).
- Headscale's diagnostic helper copies the official ARM64 [grpcurl v1.9.4](https://github.com/fullstorydev/grpcurl/releases/tag/v1.9.4) executable from its SHA-256-verified release archive for local enrollment. The archive's MIT notice is packaged at `/usr/share/licenses/grpcurl/LICENSE`.

No image contains server credentials or desktop-client code. Regional ECR
publication uses immutable content identities. [Image policy](../docs/images.md)
describes stable resolution, verification and evidence limits; regional launch records own deployed versions.

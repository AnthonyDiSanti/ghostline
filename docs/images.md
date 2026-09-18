# Gateway images

The gateway uses three Linux ARM64 artifacts. `infra/lib/ecs-release.ts` maps each artifact to its exact inputs and content-derived `sha-…` tag; `ecs-images.ts` prepares and verifies publication. `npm run ecs <target> publish` mirrors/builds them into regional immutable ECR repositories. Images contain no credentials.

| Artifact | Packaging | Configuration |
| --- | --- | --- |
| `xray` | Unmodified official `ghcr.io/xtls/xray-core` 26.7.28 ARM64 image, mirrored by digest | Explicit config command; protocol-private read-only RAM mount |
| `awg` | Ghostline ARM64 build of official amneziawg-go/tools sources, Alpine runtime | Network startup reads a protocol-private read-only RAM file |
| `gateway-config` | Alpine 3.24.1 plus jq 1.8.2-r0 and Ghostline renderers | ECS injects both server parameters; prepares both files and exits |

## Provenance and identity

The Xray manifest digest is `sha256:96e356574d4de2e4c6f9dea2ff79a9e4dc439558df73a38eefd8192553c9f367`. Publication compares image configuration/layers and native Linux ARM64 metadata to the official source. There is no Ghostline Xray Dockerfile or startup wrapper.

AWG's [build recipe](../runtime/ecs/awg.Dockerfile) compiles daemon 3.1.20260828, source `b5928efb6ca19f0153958460c3d141f04abc5c2e`, and tools 3.1.20260812, source `ee0f0a9aa34ff0a0da4b3433b9512781cfe02843`. Source archives have SHA256 checksums; builders/base images have digests; Go modules are verified; direct runtime packages are pinned. The daemon's reported version string is stale, so source identity and actual compatibility establish the selected release. Upstream licenses remain in the image; see [notice](../runtime/NOTICE.md).

Transitive package repositories can change; immutable publication preserves a deployed artifact but does not promise every future rebuild is byte-identical. `releaseFiles()` defines the exact nonsecret build context. Artifact and platform are included in release identity. Check the actual image platform before publication; emulation is not server acceptance.

The official AWG daemon image did not publish ARM64 at the September 17 review. Building maintained official source avoids adding an unrelated supervisor/configuration system. [Official daemon source](https://github.com/amnezia-vpn/amneziawg-go), [tools](https://github.com/amnezia-vpn/amneziawg-tools), [Xray source](https://github.com/XTLS/Xray-core).

## Release policy

Anthony selects **official stable releases only**, resolved afresh for each new build, and accepts compatibility debugging. Exclude drafts, prereleases and nightly/main builds. Verify every download against published checksums and available verifiable provenance; record resolved versions and artifact identities. Resolve once per build and include the resolved inputs in the immutable image/cache identity. A restart uses its selected release; it does not discover updates.

The current publisher still uses fixed recorded inputs; automatic stable-channel resolution is a tracked follow-up. The September 17 official API check classified deployed Xray 26.7.28 as a prerelease while `/releases/latest` returned stable 26.3.27. Re-resolve at implementation time; no downgrade occurred during architecture cleanup. [Official Xray releases](https://github.com/XTLS/Xray-core/releases).

AWG tools expose GitHub Releases with stable/prerelease flags. The daemon publishes versioned source tags/official images without GitHub Releases; a resolver must establish its publisher's stable channel rather than treating an arbitrary `latest` tag as proof. [Daemon publication](https://hub.docker.com/r/amneziavpn/amneziawg-go/tags), [tools releases](https://github.com/amnezia-vpn/amneziawg-tools/releases).

## Verification

`npm run test:ecs-images` tests the ARM64 artifacts with disposable synthetic identities: exact rendered bytes, private ownership, read-only handoff, engine startup, AWG in-place restart, invalid input rejection and both-protocol cleanup on partial failure. The actual shared wrapper and reusable per-protocol renderer are both exercised. Local storage holders model a host-owned RAM mount; they are test fixtures, not production sidecars.

`npm run ecs <target> test` selects the stable deployed task's owned immutable images rather than assuming current local source has been published. Real encrypted HTTPS checks establish protocol egress; [runtime](ecs.md) and regional launch records own lifecycle/security evidence.

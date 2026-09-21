# Gateway images

The gateway uses three Linux ARM64 artifacts. `npm run images:build` resolves official stable engine versions, builds the candidate images and runs local compatibility checks. Only success atomically updates [the recorded selection](../infra/image-inputs.json). `ecs-release.ts` combines those inputs with the exact recipes/fixtures into content-derived `sha-…` tags. Images contain no credentials.

| Artifact | Packaging | Configuration |
| --- | --- | --- |
| `xray` | Unmodified official `ghcr.io/xtls/xray-core` ARM64 image, mirrored by resolved digest | Explicit config command; protocol-private read-only RAM mount |
| `awg` | Ghostline ARM64 build of official amneziawg-go/tools sources, Alpine runtime | Network startup reads a protocol-private read-only RAM file |
| `gateway-config` | Alpine 3.24.1 plus jq 1.8.2-r0 and Ghostline renderers | ECS injects both server parameters; prepares both files and exits |

## Build, publish and deploy

From `infra/`, with Node 24, Docker/buildx, curl and GitHub CLI (`gh`) authenticated to `github.com`:

```sh
npm run images:build
npm test
npm run release publish primary
npm run release status
```

Build is AWS-free and does not change native VPN routing. It resolves once, tests an isolated candidate input file, and records the selection only on success. Failed downloads, ambiguous architectures, changed upstream policy, moved source tags or failed compatibility checks stop the build. The recorded selection remains usable for offline checks and publication. Review the resulting JSON diff; it records versions, revisions, source checksums and image/publication digests. Commit it with related recipe changes.

Anthony approved authenticated public metadata reads on September 19. `upstream-download.ts` routes only the reviewed public repositories' release/tag/commit endpoints through explicit `gh api --hostname github.com --method GET` calls. Existing CLI credentials remain inside `gh`; the resolver never retrieves a token or passes authentication headers. Source archives/workflow files still use anonymous HTTPS curl. Inherited `GH_DEBUG`/legacy `DEBUG` HTTP logging and interactive prompts are disabled; captured failure output is withheld. A failed authenticated read stops resolution instead of falling back to the exhausted anonymous quota. [GitHub API CLI](https://cli.github.com/manual/gh_api), [environment controls](https://cli.github.com/manual/gh_help_environment).

Publication consumes the successful central qualification record and its exact local image IDs. It performs transfer-identity checks only, then distributes the complete release through primary/DR native replication. Regional handlers validate local manifests/production aliases and force an ECS deployment. They do not rebuild or repeat image/protocol tests. [Release workflow](releases.md) owns topology, tags, history, lifecycle and recovery.

Deployment/start do not rediscover upstream releases. Static task definitions reference local `keep-production` aliases; ECS captures their digests per deployment. Resuming a stopped endpoint resolves the validated local intended set. Regional launch records describe observed deployment state; the build-input file describes the selected central build.

September 19 deployed selection: Xray **26.3.27**, AWG daemon **3.1.20260828**, tools **3.1.20260812**. Both [Stockholm](launch-stockholm-ecs.md) and [Cape Town](launch-cape-town.md) run gateway task revision 3 with this selection. Xray's official stable replaced prerelease 26.7.28; AWG's upstream versions are unchanged. Exact-artifact publication checks, live runtime/security verification and both encrypted HTTPS/assigned-EIP tests pass in each region. Credentials, hosts and EIPs are unchanged; native-device acceptance remains distinct.

## Release policy

Anthony selects **official stable releases only** for new builds and accepts compatibility debugging. Resolution is implemented in `stable-images.ts`:

- Xray and AWG tools: use each official GitHub `/releases/latest`, require explicit `draft=false` and `prerelease=false`, and reject nonnumeric release tags. Do not substitute newest prereleases if the stable version is older. [Xray releases](https://github.com/XTLS/Xray-core/releases), [tools releases](https://github.com/amnezia-vpn/amneziawg-tools/releases).
- AWG daemon: upstream has no GitHub Releases. Its [tag publication workflow](https://github.com/amnezia-vpn/amneziawg-go/blob/master/.github/workflows/build-if-tag.yml) publishes numeric semantic versions to the official Docker Hub repository. Select the highest strict numeric source tag across paginated results, verify that workflow at the selected commit, and require its matching versioned official image. Record the publication digest as evidence, but build ARM64 from source. This is our interpretation of upstream's versioned publication channel; no GitHub stable flag or independent signed attestation exists. Missing publication or changed policy fails closed. [Official images](https://hub.docker.com/r/amneziavpn/amneziawg-go/tags).

No channel uses arbitrary registry `latest`, nightly or main builds. Resolve source refs to full commits and recheck them before accepting the set. Resolution timestamps do not change image identities; actual build inputs do. Base/toolchain images and direct Alpine packages remain explicit recipe inputs; this resolver updates protocol releases, not every OS dependency.

## Verification and provenance limits

Xray selection requires exactly one Linux ARM64 manifest from the versioned official image. Docker verifies OCI manifest/config/layer digests during pull; check its platform and reported engine version, then compare mirrored image configuration and layers to upstream. The [official image workflow](https://github.com/XTLS/Xray-core/blob/main/.github/workflows/docker.yml) disables build provenance. Its [Dockerfile](https://github.com/XTLS/Xray-core/blob/v26.3.27/.github/docker/Dockerfile) compiles separately from release ZIPs, so a ZIP checksum cannot authenticate the container binary. There is no Ghostline Xray Dockerfile or startup wrapper.

AWG source archives are downloaded from official GitHub commit URLs over HTTPS. Upstream does not publish independent checksums for these generated archives; the resolver computes and records SHA256, and BuildKit's `ADD --checksum` checks its separate download. This establishes recorded-byte integrity, not an independent publisher signature. Go modules are also verified. Daemon version output is stale; source commit and actual protocol behavior establish its selected release. Upstream licenses remain in the image; see [notice](../runtime/NOTICE.md).

Transitive package repositories can change; immutable publication preserves a deployed artifact but does not promise byte-identical future rebuilds. The central build records exact tested image IDs; the publisher transfers those bytes rather than rebuilding from equivalent inputs. `releaseFiles()` defines the exact nonsecret context; resolved source commits/checksums enter AWG's build arguments and content identity.

## Verification

`npm run test:ecs-images` rebuilds/tests the recorded selection without rediscovery. It checks per-renderer secret environments, exact rendered bytes, private ownership, read-only handoff, engine startup, AWG in-place restart, invalid input rejection and both-protocol cleanup on partial failure. It also establishes real REALITY/VLESS and AWG sessions between disposable local Docker clients/servers and transfers a random HTTP response through each encrypted tunnel. AWG's handshake timestamp is checked. Synthetic credentials match our generated protocol settings; production secrets are unnecessary.

Local storage holders model a host-owned RAM mount; they are test fixtures, not production sidecars. REALITY still needs outbound access to its configured camouflage TLS destination. The local test does not change the Mac's routing. Failed synthetic probes retain private diagnostic logs under `.local/deployments/image-tests/`; tests remove their containers and RAM volumes.

These checks establish configuration, startup and protocol compatibility, not native-client acceptance, EC2 networking or censorship resistance. After an authorized rollout, `npm run ecs <target> verify` checks live security/state and `test` checks real encrypted HTTPS and assigned EIP egress using the deployed task's images. Physical-device browsing and sleep/wake acceptance remain separate. [Runtime evidence](ecs.md).

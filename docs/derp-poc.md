# DERP/STUN integration and qualification

Anthony authorized core integration and updating every running maintained node on November 17, 2026. Source, seven-image ARM64 and central native gates pass. Stockholm, Oregon, Zurich and NVA are deployed and accepted; Cape Town remains parked. All original controller modes are restored. [Handoff](../.context/handoff.md) owns observed deployment state.

Stockholm is the first maintained migration. Use the common ECS recipe, native blue-green replacement and the same two public addresses. Headscale, native tailnet admission/map distribution, Tailscale exits, IPv6 and home-destination concealment remain later [milestones](headscale.md#delivery-milestones).

## Runtime and addresses

The regional gateway adds one essential `derp` container. It contains upstream `cmd/derper`, which serves both relay traffic and STUN; no second discovery image is needed. The later `tailscaled` exit engine will be a STUN client, not a public STUN server.

| Public endpoint | Container path | Purpose |
| --- | --- | --- |
| Existing Xray EIP, TCP 443 | Existing Xray binding | Preserve existing clients |
| Existing AWG EIP, UDP 443 | Existing AWG binding | Preserve existing clients |
| Existing AWG EIP, TCP 443 | Address-aware DNAT to DERP TCP 8443 | TLS relay |
| Existing AWG EIP, UDP 3478 | DERP UDP 3478 | STUN discovery |

ECS publishes DERP TCP on the unique internal host port 18443. The restricted network daemon dispatches by original destination address before Docker's generic TCP-443 mapping; the internal port and wrong-address paths remain blocked. Existing per-engine SNAT, metadata/peer isolation and stale-discovery quarantine apply. No additional EIP, interface, load balancer or engine task role is required.

Before Headscale admission exists, `derp.allowedSources` requires explicit canonical IPv4 `/32` entries; empty, duplicate, broad and unknown configuration is rejected. The planned fleet probe sources are the owned Oregon and NVA AWG addresses. Host rules restrict both listeners; UDP 3478 also has source-specific security-group rules. Do not expose an anonymous public relay. New DERP outbound initiation is denied; replies to admitted connections are permitted.

STUN is consumed by Tailscale nodes. Headscale distributes its addresses in the DERP map, alongside the relay addresses; clients send UDP discovery probes and separately establish TLS/TCP relay connections. DERP forwarding works when UDP discovery is unavailable. [Upstream flags](https://github.com/tailscale/tailscale/blob/v1.104.7/cmd/derper/derper.go), [client netcheck](https://github.com/tailscale/tailscale/blob/v1.104.7/net/netcheck/netcheck.go).

## Images and provenance

`runtime/ecs/derp.Dockerfile` builds the stable upstream Tailscale source and its exact upstream-pinned Go toolchain. Recorded commits, archive checksums and compiler checksum are in [image inputs](../infra/image-inputs.json). The stable resolver rejects protocol prereleases, draft releases and moved tags. Tailscale labels its exact compiler bundles prerelease; that compiler is a checksum-pinned dependency specified by stable protocol source, not a prerelease protocol selection.

The shared recipe has `runtime`, `gateway-config` and test-only `proof` targets. The minimal non-root DERP runtime contains the upstream binary, CA certificates/license and a static Ghostline rendering/health entrypoint. The initializer target adds the same renderer to its existing Alpine/jq recipe. The proof target uses upstream DERP client libraries and is never a runnable release member.

Upstream's documented standalone packaging is a source build of `cmd/derper`; its normal Tailscale container is the client/daemon. Headscale's image runs the coordinator, with optional embedded DERP, and has no supported relay-only startup mode. Ghostline therefore owns this official-source derivative. [DERP packaging](https://github.com/tailscale/tailscale/blob/v1.104.7/cmd/derper/README.md), [Tailscale container build](https://github.com/tailscale/tailscale/blob/v1.104.7/build_docker.sh), [Headscale startup](https://github.com/juanfont/headscale/blob/v0.29.7/cmd/headscale/cli/serve.go).

## Identity, TLS and secrets

No relay domain or DNS authority is needed. Provision a self-signed IP-SAN certificate and stable DERP server key once, against the retained AWG public IP. The static test map uses literal-IP `HostName`/`IPv4`, no IPv6 and upstream `CertName: sha256-raw:<leaf-DER-SHA256>`. Clients authenticate the exact certificate with a pin; do not use `InsecureForTests`. Future Headscale distribution must deliver that pin over its authenticated control channel. Native Mac/iOS map compatibility remains a later gate. [Upstream DERP-map fields](https://github.com/tailscale/tailscale/blob/v1.104.7/tailcfg/derpmap.go), [pin verification](https://github.com/tailscale/tailscale/blob/v1.104.7/derp/derphttp/derphttp_client.go).

From `infra/`, after the target has its retained AWG allocation:

```sh
npm run derp <target> provision
npm run derp <target> status
```

Provisioning creates a standard SecureString at `<prefix>/server/derp` and public String at `<prefix>/derp/public`. It uses resumable private staging, validates key/certificate/IP equality, never overwrites an existing identity and removes private staging after readback. The public record contains IP, pin and expiry only. Existing Xray/AWG/contact parameters are preserved. The initial certificate lifetime is 365 days; coordinate certificate replacement and map-pin propagation before expiry rather than silently regenerating on restart.

Only the shared initializer receives the three server secrets through its execution role. It validates and renders protocol-private RAM directories, removes partial output on failure and exits. DERP mounts only its own files read-only, runs UID 65532 with no capabilities/task role, a read-only root and 128 MiB limit. Its local health command verifies pinned TLS, certificate validity and a real STUN transaction. Production serving suppresses upstream client/address logs; native health and exit status remain observable. This preserves the existing initializer secret-injection boundary and does not claim that Docker metadata is RAM-only.

## Build and release

```sh
npm run images:build -- --derp
npm test
GHOSTLINE_QUALIFIED_OUTPUT=<private-absolute-path> npm run test:ecs-images
```

The DERP-only resolver reuses recorded engine/DNS inputs and updates inputs only after its local proof passes. The full seven-image gate records exact tested image IDs and source identities; production publication additionally requires matching central native qualification. Do not rebuild/retag an artifact after its qualified image ID is captured. [Image policy](images.md).

Schema v5 contains the exact seven runnable artifacts; retained v2/v3/v4 releases remain readable. Normal publication owns coherent production/MRU aliases and native replication. For this authorized migration, capture automation modes, hold maintained controllers manual, prepare seven-image support, publish the qualified set, then accept Stockholm before the other running nodes. Cape Town's configuration/intent may advance while its host stays absent. [Regional trial tooling](candidate-releases.md) supplies the bounded exclusions list and standard canary deployment; it does not resolve independently selected candidates inside production power jobs.

## Qualification and acceptance

1. **Local:** validate the stable source/toolchain, private RAM rendering, repeated whole-initializer three-secret handoff/cleanup, real two-client payload transfer, pinned TLS, wrong-pin rejection and STUN, including relay with UDP unavailable. Run focused tests, full source gate and the seven-image ARM64 gate.
2. **Isolated native:** use the same common stack with synthetic credentials in a region outside the maintained replication mesh. Deploy the six-image baseline, add DERP, migrate six-to-seven with retained EIPs, verify host confinement/public transport, induce a failed green and observe native ECS rollback, then test ordinary stop/start/park/unpark and close central platform qualification. Remove disposable resources through normal destroy/purge, preserving independent security.
3. **Stockholm:** review fresh shared-template diffs, enter the trial exclusion, use normal native blue-green deployment and verify both existing encrypted engines, native DERP health, public TLS/STUN/relay, rejected forbidden sources/internal ports and unchanged identities/endpoints. End the exclusion only against the verified selected production generation.
4. **Running fleet:** deploy and verify Oregon, Zurich and NVA, preserve parked Cape Town, restore captured automation modes and re-query exact selected/running digests, native deployment health, EIP/credential continuity and absence of temporary hosts/exclusions.

Public relay probes run two disposable upstream clients inside an existing AWG test client's Docker network namespace. Their connections emerge from an admitted AWS address; no personal source address needs to enter the catalog. Use Oregon for the other relays and NVA for Oregon, so the tunnel endpoint's `/32` route exception cannot bypass the tunnel. Immediately check native Mac VPN/app/route state before live probes and restore any prior connection.

Serialize tests that use the same regional AWG device identity. Simultaneous containers sharing one key can move that peer's return endpoint between clients; this follows [WireGuard's authenticated endpoint roaming](https://www.wireguard.com/#built-in-roaming). Native host audits and client tests using different regional identities may run concurrently.

For a sustained health-failure experiment, stop only the DERP server process with `SIGSTOP` and keep Docker's health commands running, including across task replacement. Docker `pause` also suspends health monitoring and can leave its previous `HEALTHY` value visible; it is not evidence of a tested application-health rollback. The isolated harness restores only freshly verified processes it stopped and always closes diagnostic authority.

Local Docker tests do not establish native Tailscale enrollment, Mac/iOS behavior, censorship resistance, seamless sessions or home-destination concealment. DERP connection tables/sockets rebuild across host replacement. Keep these evidence limits distinct from a successful Ghostline transport deployment.

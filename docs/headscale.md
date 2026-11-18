# Headscale and Tailscale integration plan

Status: DERP/STUN core integration and all four running-node migrations are accepted on November 17, 2026 (New York); Cape Town stays parked. Headscale and the Tailscale exit engine remain planned. [DERP runbook/evidence](derp-poc.md) separates deployed relay support from future tailnet enrollment and map/admission automation.

## Delivery milestones

1. **DERP server PoC — complete, including core/fleet integration** — Stockholm and the other three running nodes pass relay/TLS/STUN, existing-engine continuity and common deployment/security checks. [Integration runbook](derp-poc.md). Admission stays restricted until Headscale validation.
2. **Headscale server** — deploy the actual single-active Headscale service and its state, DNS/TLS and operating dependencies using this repository's infrastructure code.
3. **Attach DERP to Headscale** — automate map publication and fail-closed client verification; prove ordinary client connectivity.
4. **Tailscale exit-node PoC** — test native clients, enrollment, state storage and restart/replacement while preserving the selected regional identity.
5. **Complete Tailscale/coordinator integration and fleet rollout** — finish automated enrollment, map and lifecycle handling around the deployed shared DERP/ECS support; qualify exit replacement/rollback and roll out.

Storage and identity checks belong inside these PoCs. Upstream home-destination concealment and relay-only policy remain deferred. Anthony authorized DERP/STUN implementation and the running-fleet rollout on November 17; coordinator and exit-engine deployment need their later work units.

## Scope and ownership

Ghostline will own the full self-hosted Headscale service and its required AWS networking, DNS/TLS, persistent state, recovery, enrollment automation, access policy, relay map, monitoring and compatible artifacts. Each maintained regional gateway will support a Tailscale exit engine and standalone DERP/STUN when running. A parked deployment has no running engine/relay. Public IPv6 ingress/egress is deferred, matching the existing engines; leakage/failure behavior still requires testing.

Deferring public IPv6 does not imply removing every internal overlay IPv6 setting. Preserve upstream-supported tailnet addressing, and verify that unavailable IPv6 internet destinations fail closed through a selected exit rather than escaping via the client's direct connection.

Use one single-active coordinator, independently managed from regional gateway tasks and park/destroy operations. Recommend a dedicated small ARM64 EC2 instance with encrypted EBS, stable public endpoint, native service management and SSM-only administration. Select its OS, region, domain, recovery objectives and consistent backup retention before implementation. Keep the regional Bottlerocket recipe unchanged in principle; it is not a suitable place to replicate SQLite coordinators. [Headscale requirements](https://headscale.net/stable/setup/requirements/).

The UDM Pro remains an integration endpoint: home subnet selection, community installation and local recovery need a coordinated home-network work unit. No extra identity-provider service, management UI, load balancer or active-active database is required for the initial deployment. Devices can enroll through Headscale's existing approval/preauth flows.

## Three operations often called enrollment

1. **Exit-node enrollment:** `tailscaled` joins Headscale as a tagged tailnet node using a scoped preauth key. Headscale assigns node identity metadata and tailnet addresses.
2. **DERP publication:** the deployment workflow adds a healthy regional relay to Headscale's configured DERP map. Standalone `derper` does not join as a tailnet node or natively register itself into that map. Running an adjacent exit node does not automatically publish its relay.
3. **DERP admission:** each relay calls the coordinator's HTTPS `/verify` endpoint to validate a connecting node key. Set `-verify-client-url-fail-open=false` explicitly. Relays need neither a tailnet enrollment key nor a Headscale administrative key for this verification mode.

All three can be automated under one deployment command, without hand-editing Headscale for each region. Use the trusted deployment workflow to publish relays, rather than giving public-facing relay processes coordinator-mutation credentials. Verify the resulting map on the coordinator and a real client; a file write alone does not prove map propagation. [DERP map and verification](https://headscale.net/stable/ref/derp/), [tagged registration](https://github.com/juanfont/headscale/blob/v0.29.7/docs/ref/registration.md).

Regional DERPs do not require public DNS names. Prefer the [IP-only PoC candidate](derp-poc.md#identity-tls-and-secrets): literal EIP, explicit address families and upstream leaf-certificate pinning. Map metadata names are not DNS records. Qualify actual lookup/SNI behavior, certificate persistence/rotation and native-client map propagation. The coordinator's TLS/bootstrap endpoint remains a separate choice; do not infer the whole tailnet emits no DNS.

DERP is Tailscale's relay protocol, also implemented by compatible systems such as Headscale. It is not a general TURN service or a relay automatically usable by Xray, AmneziaWG or an ordinary WireGuard client. Its STUN component uses a general NAT-discovery protocol. DERP carries discovery and end-to-end encrypted tunnel packets; it is separate from internet egress. [Upstream DERP implementation](https://github.com/tailscale/tailscale/tree/v1.104.7/cmd/derper).

Direct `/verify` admission preserves Headscale as a dependency for new relay connections. Existing paths may survive coordinator outages; reconnect/failover admissions can fail. This is accepted planning behavior under Anthony's requested direct validation model. Local `tailscaled` verification and custom admission caches are outside the selected plan.

## Future connection flow and service roles

An exit node is an ordinary `tailscaled` peer configured to forward internet traffic. Enabling that role does **not** start a public STUN server; `tailscaled` uses STUN as a client, just like the laptop/phone/home gateway. STUN helps discover reachable public UDP mappings and network conditions for all peers. It is not an exit-specific routing dependency. [Client STUN handling](https://github.com/tailscale/tailscale/blob/v1.104.7/net/netcheck/netcheck.go), [exit-node role](https://tailscale.com/docs/features/exit-nodes).

The future services are:

| Service | Process | Purpose |
| --- | --- | --- |
| Coordinator | Headscale, independently deployed | Membership, keys, access policy, peer information and relay/STUN map distribution |
| Connectivity infrastructure | One `derper` process on each running regional gateway | Built-in STUN on UDP 3478 plus DERP relay on TCP 443 |
| Regional exit | A separate `tailscaled` container on each running regional gateway | Tailnet peer, STUN client and optional client-selected internet exit |

STUN really **is inside the derper process**; independence refers to the two protocols/functions, not separate images or sidecars. A public STUN server supplies an outside view of a client's NAT mapping. Running a STUN server behind the same client-side NAT would not automatically give that outside view. The relay fleet is a natural public home for the discovery service, so we can replace reliance on the corresponding public Tailscale infrastructure without building another server. [Bundled STUN startup](https://github.com/tailscale/tailscale/blob/v1.104.7/cmd/derper/derper.go), [NAT traversal](https://tailscale.com/blog/how-nat-traversal-works).

Clients discover STUN through the **same DERP map**, not a separate inventory. A node entry contains its address fields and `STUNPort` (default 3478), alongside `DERPPort` (default 443) and TLS metadata. The client first knows the configured Headscale bootstrap endpoint, obtains its map over the authenticated control connection, then uses those entries for UDP STUN probes and relay connections. It does not need STUN to bootstrap the ordinary outbound Headscale connection. Our deployment workflow must reconcile the regional address/port entries in Headscale; derper does not automatically register them. [Map fields](https://github.com/tailscale/tailscale/blob/v1.104.7/tailcfg/derpmap.go), [Headscale map response](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/mapper/mapper.go).

For a client using a Ghostline exit, the two possible bulk-data paths are:

- Direct: device → encrypted UDP connection → selected exit → internet.
- Relayed: device → DERP → selected exit → internet. Both peers establish connections to the relay; DERP forwards their still-encrypted Tailscale packets. The selected exit removes the Tailscale tunnel layer and forwards internet traffic, which can retain its own application HTTPS encryption.

Headscale supplies coordination and maps; normal browsing traffic does not pass through it. STUN exchanges small discovery packets rather than carrying browsing traffic. Direct and relay are transport choices to the **same selected exit**. The relay/STUN region does not have to match the exit region, and colocation on our hosts does not merge those roles. For example, a client could use Stockholm discovery/relaying while choosing Oregon for internet egress. These examples describe logical roles, not an assertion about a particular selected client's relay preference. [Connection types](https://tailscale.com/docs/reference/connection-types).

These are not strictly sequential startup stages: Tailscale can establish relay connectivity while working toward a direct connection, and DERP may continue carrying discovery/control messages after bulk data becomes direct. STUN being unavailable does not prevent DERP transport from working. It can help direct connectivity, but is not universally necessary for a public exit to be reachable. Accessing home uses the same discovery/relay infrastructure with the home gateway as the peer; that does not require the peer to be an internet exit.

The first PoC qualifies this shared discovery/relay infrastructure (`derper`, including STUN). The later exit-node milestone adds a consumer (`tailscaled`) of that infrastructure. This sequencing does not imply STUN is used only by future exit nodes.

## Travel access and hiding the home destination

**Deferred by Anthony on November 16:** first get ordinary DERP/Headscale/Tailscale connectivity working. Do not add `only-tcp-443`, VPN stacking, a travel router, custom routing modes or a home-destination concealment gate to the initial PoC. The future observer model remains the hotel/ISP/national network upstream of a remote device accessing home. Default Tailscale may probe home directly, so the PoC must not be described as hiding the home destination from that observer.

Anthony explicitly rejects relying on `only-tcp-443` or otherwise restricting remote clients. Future work should investigate home-side ingress/proxy design, recognizing that a server cannot prevent a remote client from probing a known home address. Ordinary tailnet ingress ACLs do not select DERP transport. Retain prior source research only as background, not a candidate to revisit unless Anthony changes this direction. [Capability source](https://github.com/tailscale/tailscale/blob/v1.104.7/tailcfg/nodecap/nodecap.go), [Headscale compiler](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/policy/v2/compiled.go).

## Configuration generated per deployment

Extend the strict catalog with explicit stable nonsecret identities; do not infer identity from list order, temporary EC2 IDs or blue-green slot letters. Existing AWS stack/resource identities must not be renamed.

| Input or generated value | Example for Oregon | Ownership |
| --- | --- | --- |
| Existing deployment ID / AWS region | `oregon` / `us-west-2` | Existing catalog |
| Display label / tailnet hostname | `Ghostline Oregon` / `gl-oregon` | Deterministic from a stable configured slug |
| Service and regional tags | `tag:ghostline-exit`, `tag:gl-oregon` | Coordinator policy and scoped enrollment key |
| DERP ID/code/name | Explicit unused integer / `gl-oregon` / `Ghostline Oregon` | Stable catalog allocation; never positional |
| DERP TLS endpoint / certificate pin | Existing regional EIP / generated `sha256-raw:` leaf-certificate fingerprint | Prefer IP-only endpoint; generated relay configuration and authenticated DERP map |
| Public IPv4/listeners | Observed owned EIP; TCP 443, UDP 3478 | Regional stack and network policy |
| Direct Tailscale listener | Dedicated UDP port, initially 41641 | Shared runtime contract |
| State/resource references | Target-specific encrypted state and secret references | Regional lifecycle; values never in catalog |

Stockholm may use a clean new display slug while retaining target `stockholm-ecs` and its historical AWS names. Validate hostname/tag/DERP-ID uniqueness, domain ownership and cross-account/region references before writes. A display name is not an authentication credential. Headscale assigns node IDs/tailnet addresses; derive neither from the EIP nor from a region number.

There is no need to generate a new Mac/iPhone credential pair for every exit as with existing independent VPN profiles. Each personal device joins the tailnet once and can use permitted exits. Keep its identity distinct from service-tagged cloud nodes.

## Automatic first enrollment and reconciliation

Recommend adding enrollment to the existing explicit initialization/deployment workflow:

1. Read a metadata-only plan: target identity, existing node/state reference, intended service tags, route authorization and relay-map change. Reject conflicts and unexpected pre-existing nodes.
2. If valid persistent node state exists, restore it and reconnect without minting another enrollment key. An expired bootstrap key is not a reason to replace an established node.
3. For an explicitly new identity, trusted coordinator administration mints a short-lived, single-use, non-ephemeral tagged preauth key. Headscale 0.29.7 documents single use and a one-hour default; choose an explicit bounded lifetime for automation.
4. Deliver it privately through the regional secret/initializer boundary. The exit engine reads its own bootstrap material; other engines receive no enrollment or administrator credential. Never place key values in argv, images, templates, SSM command output, diagnostic logs or Git.
5. Start `tailscaled` against the configured coordinator, with the generated hostname, exit advertisement, no unwanted subnet advertisements, no accepted home routes/DNS changes on the gateway, and a dedicated state store.
6. Headscale tags plus `autoApprovers.exitNode` can approve exit advertisements. Separately authorize Anthony's personal devices to use `autogroup:internet`; approval is not an access grant. Deny cloud-node initiation into home VLANs unless deliberately permitted.
7. Record public identity fingerprints/node ID, expected tags, assigned addresses and status. Remove expired/consumed bootstrap material according to the delivery contract. On an uncertain registration response, reconcile against expected machine identity before retrying; hostname equality alone is insufficient.
8. After independent DERP/TLS/STUN checks, reconcile the coordinator's relay map with endpoint IPs/certificate pins; update DNS only if a later explicit design uses it. Preserve other entries; publish only intended running relays and verify map delivery. Stop/park/destroy must reconcile publication with bounded retries and explicit partial-state reporting.

Avoid placing a broad Headscale API key on gateways. A concrete administration design to qualify is a fixed, parameter-validated SSM document on the coordinator invoking its local administrative interface. It accepts only allowlisted deployment operations, captures secrets internally and writes short-lived enrollment material directly to exact regional SecureString destinations. Its role must not read other protocol credentials. This is a proposed implementation, not an existing permission or arbitrary remote-shell interface. Automated image releases must use the same lifecycle and must not require interactive approval for routine reconnects.

## Enrollment keys, persistent state and exit selection

A **single-use preauth key** admits one new node identity; it is not a password consumed by each tunnel, reboot or TCP connection. Generate a fresh short-lived key when enrolling another identity, expire unused keys, and remove consumed delivery material. Existing nodes reconnect using their own state after the enrollment key expires. Tagged Headscale nodes are exempt from the default node-expiry policy in the inspected release; expiry/reauthentication and ordinary tunnel rekeying are distinct from bootstrap-key issuance. No custom periodic key-rotation controller is selected. [Pinned registration/configuration](https://github.com/juanfont/headscale/blob/v0.29.7/docs/ref/registration.md).

Correction to the initial storage assessment: Tailscale's **core identity/preferences state is a key/value store**. The default FileStore caches that map and atomically serializes it into `tailscaled.state`; it is not the tunnel's traffic buffer or a general filesystem workload. Other state-directory contents (logs, Taildrop, feature state), runtime sockets and DERP TLS/key caches are separate concerns. Headscale's coordinator SQLite database is also a separate persistent workload. Do not conflate them. [FileStore source](https://github.com/tailscale/tailscale/blob/v1.104.7/ipn/store/stores.go).

Sharing one directory over EFS/NFS does not make two daemons safe: each has a process-local cached map and mutex; writes replace the complete serialized map without a distributed ownership protocol. Two daemons also clone one network identity. The same shared-identity problem exists with SSM/DynamoDB/Redis, regardless of atomic writes. Separate directories/state keys for independent identities avoid that specific sharing problem. A shared filesystem would carry state operations, not encrypted user traffic; latency, availability and client overhead still need measurement on this burstable host. There is no selected need for network storage.

The upstream AWS SSM state backend is therefore a natural candidate for the **core KV state**, not an attempt to emulate a filesystem. Version 1.104.7 uses SecureString writes and intelligent tiering up to 8 KiB. Qualify actual serialized size/growth, errors and durability. IAM is a valid access-control mechanism; the remaining architectural question is how to grant exact state access within the current shared ECS task, whose task role would be shared across containers. Do not silently relax that boundary. No custom DynamoDB/Redis backend or distributed filesystem is selected. [SSM source](https://github.com/tailscale/tailscale/blob/v1.104.7/ipn/store/awsstore/store_aws.go).

Preserving identity preserves a client-selected node; it does **not** migrate a running daemon's sockets, DERP connection, UDP path or host conntrack/NAT state. Replacement requires transport recovery and may break application flows even if the public IP and node identity stay the same. Zero interruption/session migration is not a goal.

Anthony now favors preserving the Tailscale-level regional identity because native per-region pool selection is not established. Make stable identity plus exclusive activation the preferred PoC candidate; retain independent-node selection as background/fallback research:

- Distinct blue/green node identities and state keys, with shared regional/service tags, can coexist without copying a live identity. Enrollment and route approval remain automated. The client picks one exit, not a per-flow load balancer.
- Tailscale supports `auto:any` and an `AllowedSuggestedExitNodes` managed-client ID list. Headscale 0.29.7 emits approved-exit suggestion capabilities and supports `via` tags for restricting eligible exits. These are building blocks for automatic selection, not proof of a native “Ghostline Oregon” pool entry in the Mac/iOS menu.
- The inspected client supports only the `any` auto expression, not a `auto:tag:oregon` selector. Client-side allowed-ID lists must track replacement IDs; server-side `via` policy can restrict eligible nodes for a user/device but is not itself an interactive region selector. Qualify failover, policy changes, stale/offline nodes and manual versus automatic regional choice using real Mac/iOS clients.
- Independent replacement can still interrupt existing internet flows and changes the selected node. Tags, a DNS alias, common route advertisements or an EIP handoff alone do not prove grouped-exit behavior. Generic subnet-router HA documentation must not substitute for this test.
- For the preferred stable-identity candidate, fence the old daemon before activating its state on the replacement, and fence the replacement before rollback. Verify that native clients keep the same selected node after reconnect. Never run simultaneous clones. Independent replacement identities are not selected for the PoC.

[Automatic exit selection](https://tailscale.com/docs/features/exit-nodes/auto-exit-nodes), [managed-client pool controls](https://tailscale.com/docs/features/tailscale-system-policies#suggest-allowed-forced-exit-nodes), [client expressions](https://github.com/tailscale/tailscale/blob/v1.104.7/ipn/prefs.go), [Headscale suggestion behavior](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/policy/v2/tailnet_state_caps.go).

DERP's private server key and manual IP-SAN certificate are now persisted per logical relay in Parameter Store, with private rendering and public pin/expiry metadata described in the [DERP identity contract](derp-poc.md#identity-tls-and-secrets). Coordinate renewal and map-pin propagation before expiry; no ACME cache or per-relay DNS name is required. This static relay identity remains separate from changing core Tailscale KV state and user traffic.

## Address capacity and public ports

AWS documents `t4g.small` as three network interfaces with four IPv4 addresses per interface. Ghostline currently uses one interface and two address/EIP pairs, leaving two address slots in that existing interface. The two remaining slots are on that one existing interface; three interfaces could provide twelve private IPv4 address slots in total, subject to configuration/quota constraints. A new interface is not needed until the selected design exhausts the first one. [EC2 network specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html), [addressing](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/MultipleIP.html).

Anthony accepts reusing existing public addresses when correct routing is qualified. Prefer keeping the gateway's current two-EIP layout:

| Public identity | Service | Public listener |
| --- | --- | --- |
| Existing Xray EIP | Xray/REALITY | TCP 443 |
| Existing AWG EIP | AWG | UDP 443 |
| Existing AWG EIP | DERP | TCP 443 |
| Existing AWG EIP | STUN | UDP 3478 |
| Existing AWG EIP | Tailscale direct transport | UDP 41641 |

Tailscale internet egress can SNAT to the AWG-associated private address, so an exit node does not inherently require its own EIP. Sharing public identity is accepted for planning; keep separate container namespaces and qualify replies, UDP mapping/keepalives, exact SNAT, metadata/host isolation and startup quarantine. This preserves both current Xray/AWG endpoints and avoids adding an address merely for a new engine. No mappings have been implemented.

Inbound destination mapping is feasible. The limitation is ECS's bridge `PortMapping`, which reserves a host port without exposing Docker's address-specific `HostIp`. Xray and DERP cannot both ask ECS for host TCP 443 even when their public addresses differ. Give them distinct internal bindings (for example, 443 and 8443), then let the existing validated network daemon match the destination private IP and public port and DNAT to the correct container. External TCP 443 stays available on both EIPs; internal host ports stay externally blocked. This is an extension to the existing address-aware policy, not a need to abandon containers. [ECS PortMapping](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html).

The exact account/region quota is **EC2-VPC Elastic IPs**, service `ec2`, code `L-0263D0A3`, under **Amazon Elastic Compute Cloud (Amazon EC2)** in Service Quotas, not VPC. The November 16 readback verifies quota 20 in all 33 reachable enabled commercial regions, including every maintained region; Bahrain remains unverified. Current gateway blue-green uses two retained plus two transient EIPs (four total). The earlier three/six count was conditional on a separate third address, not actual deployed behavior. The coordinator's public address is a separate resource/count. [NVA console entry](https://us-east-1.console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-0263D0A3).

The existing regional gateway uses two EIPs, with two transient allocations during blue-green. DERP/exit listeners are intended to reuse those addresses. NVA's earlier seven-listed/five-quota discrepancy was five customer allocations plus two quota-exempt ALB-managed addresses. The legacy instance/disk/ENI/EIP have since been [retired with an encrypted recovery archive](../.context/knowledge/legacy-insightfulappetite-recovery.md). [Current quota readback](../.context/knowledge/eip-quota-requests.md) verifies all 33 submitted requests approved with applied quota 20, including every maintained region; Bahrain remains unreachable/unsubmitted.

The detailed acceptance checks remain inside the five delivery milestones above: existing-engine continuity, private-map admission, ordinary native client connectivity/selection, state/error behavior, restart/blue-green rollback, stop/start/park/destroy and coordinator restore. Inputs still needed before provisioning are the domain, coordinator placement/recovery targets and the public egress identity choice. Stable regional Tailscale identity and reuse of existing gateway EIPs are the preferred PoC direction. Home-destination concealment is deferred.

## Source snapshot and IPv6 watch

November 16 metadata: Headscale v0.29.7 and Tailscale v1.104.7 are classified stable/latest releases. Headscale remains a research candidate; Tailscale v1.104.7 is now qualified for standalone DERP/STUN, which does not qualify its exit-node engine. [Headscale release](https://github.com/juanfont/headscale/releases/tag/v0.29.7), [Tailscale release](https://github.com/tailscale/tailscale/releases/tag/v1.104.7).

Our [Bottlerocket #4954](https://github.com/bottlerocket-os/bottlerocket/issues/4954) is open with zero comments/reactions and no visible new engagement. Broader movement includes [#4984](https://github.com/bottlerocket-os/bottlerocket/issues/4984), [settings SDK #161](https://github.com/bottlerocket-os/bottlerocket-settings-sdk/pull/161), [core-kit #1101](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1101) and the linked settings migration #4985. Those concern ECS agent IP-family selection, not Docker bridge IPv6. The #4984 follow-up is from the contributor requesting CI/maintainer attention. Current core-kit v18.0.0 and `develop` Docker templates still lack the needed bridge settings. [Template](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v18.0.0/packages/docker-engine-29/daemon-json). No equivalent official bridge fix was found/qualified; IPv6 is deferred by owner direction and does not block this plan.

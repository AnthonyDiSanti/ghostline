# Headscale and Tailscale integration plan

Status: DERP/STUN core integration and all four running-node migrations are accepted on November 17, 2026 (New York); Cape Town stays parked. Anthony selects N. Virginia (`us-east-1`), one active coordinator at `https://ts.bigmantonyd.com`, SQLite, latest stable Headscale on every deploy and Bottlerocket/ECS on EC2. Initial personal-device enrollment uses manual approval; service preauth keys follow with regional exits, and Google SSO is a future preference. Recovery is a follow-up after the service works, including personal-assistant backup/abstraction review. The coordinator is deployed and qualified on November 18: trusted TLS, manual enrollment, retained state, task restart, host replacement and actual reboot pass. The confirmed TLS-stderr privacy gap remains open. [Launch and evidence](launch-headscale.md). [DERP runbook/evidence](derp-poc.md) separates deployed relay support from future tailnet enrollment and map/admission automation.

## Delivery milestones

1. **DERP server PoC — complete, including core/fleet integration** — Stockholm and the other three running nodes pass relay/TLS/STUN, existing-engine continuity and common deployment/security checks. [Integration runbook](derp-poc.md). Admission stays restricted until Headscale validation.
2. **Headscale server — working-service milestone complete** — the single-active service, retained state, DNS/TLS and native lifecycle are [deployed and qualified](launch-headscale.md). Recovery automation and the remaining privacy audit are explicit follow-ups.
3. **Attach DERP to Headscale** — automate map publication and fail-closed client verification; prove ordinary client connectivity.
4. **Tailscale exit-node PoC** — test native clients, enrollment, state storage and restart/replacement while preserving the selected regional identity.
5. **Complete Tailscale/coordinator integration and fleet rollout** — finish automated enrollment, map and lifecycle handling around the deployed shared DERP/ECS support; qualify exit replacement/rollback and roll out.

Storage and identity checks belong inside these PoCs. Upstream home-destination concealment and relay-only policy remain deferred. Anthony authorized DERP/STUN implementation and the running-fleet rollout on November 17; Anthony subsequently authorized the coordinator implementation/deployment; exit-engine deployment remains a later work unit.

## Coordinator operations

Run from `infra/` with Node 24 and the authorized AWS profile (`personal` by default). Public topology is in [headscale.json](../infra/headscale.json); the separate [CDK graph](../infra/lib/headscale-stack.ts) owns `GhostlineHeadscaleState` and `GhostlineHeadscaleRuntime`. Neither is a regional gateway catalog entry or release-mesh member.

| Command | Behavior |
| --- | --- |
| `npm run headscale plan` | Resolve current stable upstream/qualified OS and render fresh cloud diffs |
| `npm run headscale qualify` | Exercise the unchanged official ARM64 application, rootless/read-only mounts and restart persistence locally |
| `npm run headscale deploy` | Resolve latest stable again, qualify, diff, copy unchanged upstream bytes to ECR and deploy one writer |
| `npm run headscale status` | Read selected host/service/address metadata |
| `npm run headscale verify` | Check native confinement/storage, public trusted TLS health and exact-host GuardDuty; restore administrative lockdown |
| `npm run headscale users [name]` | List users, or create one manual-enrollment user |
| `npm run headscale nodes` | List sanitized node identity/address/status fields |
| `npm run headscale -- approve <user-name>` | Approve a pending registration for an existing user. Supply the registration ID through stdin. Requires the private approval helper. |
| `npm run headscale restart` | Stop the current task, observe it stopped and start one replacement |
| `npm run headscale replace-host` | Stop the writer, flush/unmount the owned filesystem, remove only compute and reattach retained state to a new same-AZ host |
| `npm run headscale delete-node <id>` / `delete-user <id>` | Explicitly delete the selected membership or empty user |

Mutations use a coordinator-specific Parameter Store exclusion and private local operation receipt beneath ignored `.local/deployments/headscale/`. An interrupted command retains ownership; resume the same action from that checkout after inspecting actual cloud state. Do not manually erase the receipt/lock to bypass a running operation. Runtime deployments disable both ECS and CloudFormation automatic rollback: reverting an image does not undo a database migration. A failed runtime operation needs diagnosis and forward repair; a failed initial runtime stack may require bounded runtime cleanup before resuming. Retain the state stack and volume. This is exclusion and evidence, not a database rollback framework.

Once a rollout is settled, its verification checkpoint binds the instance, task definition, volume and deployed-input hash. Resuming that interrupted operation verifies those same resources without restarting them or selecting another release. Use `npm run headscale -- deploy --refresh` only for an explicit forward repair that reselects latest stable and reapplies current source under the same ownership. A new deployment always resolves latest stable afresh.

The helper image supplies credential-free finite volume preparation and temporary bounded diagnostics. The application image remains the official artifact; the helper has no application credentials or runtime AWS writes. Headscale keeps its Noise key and SQLite/WAL on retained EBS, with the socket and temporary files in RAM. The TLS proxy has a separate certificate directory on the same retained volume. The official AMI needs at least a 20 GiB replaceable Bottlerocket data disk, independent of the 8 GiB application volume.

Manual clients select `https://ts.bigmantonyd.com` as their custom control server, then an operator approves the returned authentication identifier for a user. Approval does not grant broad peer/subnet access: initial policy is explicitly empty/deny-by-default. The seeded Ghostline relay map does not open the relays; source restrictions remain until the authenticated-DERP milestone.

The browser homepage at `/` is intentionally blank with the Headscale favicon. Headscale has no built-in admin panel. Ghostline administers the coordinator through the SSM-backed commands above. Use `/health` to check service availability. Device registration starts in the Tailscale client and opens its own registration URL. [Upstream routes](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/app.go#L531-L569), [Headscale web UI documentation](https://headscale.net/0.29.6/ref/integration/web-ui/).

Read the ID without echo or shell history. For example, from `infra/` in zsh:

```zsh
if IFS= read -rs 'registration_id?Pending registration ID: '; then
  builtin printf '\n' >&2
  builtin printf '%s\n' "$registration_id" | npm run headscale -- approve anthony
fi
unset registration_id
```

Host/bootstrap/AMI/template changes use stop, clean unmount and compute replacement; editing EC2 user data alone does not update persisted Bottlerocket settings. Application-only updates can retain compute. Runtime reconstruction uses the last deployed receipt, so a later planning operation cannot accidentally select unpublished images for replacement.

Regional `destroy nva` leaves the coordinator intact. The broader `purge-region` tool intentionally refuses a region that still contains live Ghostline infrastructure, including this coordinator; do not bypass that safety guard to purge NVA.

### Privacy boundary

The official application generates its keys on retained encrypted EBS; neither task environment/arguments nor host user data carries a private key or AWS credential. The application has no task role, and its network namespace cannot reach host, IMDS or task-credential endpoints. Configuration, policy and public relay pins are nonsecret. SQLite necessarily retains enrollment/coordination records, including device identities and endpoint metadata; retaining this operational state is not a claim that the coordinator is RAM-only.

Set `log.level: disabled` and `logtail.enabled: false` without changing the upstream image. The [upstream parser](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/types/config.go) uses zerolog's level selection; local qualification checks empty normal startup, administration and restart output. This is the limited privacy alignment included in the coordinator milestone. The capped local Docker log sink still exists for stderr outside that logger. Fatal/startup errors, standard HTTP/TLS diagnostics, journals/dumps and SSM/cloud records remain explicit follow-up audit paths; do not infer universal log silence or erasure of historical records. Reuse the [existing logging audit](logging-privacy-audit.md) for that review.

Native readback on the original November 18 listener found 794 bytes across four records. Three TLS-handshake stderr records contained IPv4 patterns and one stdout record was unclassified. The audit returned only counts and found zero panic patterns. The November 19 proxy rollout addresses this public TLS path. [Original launch evidence](launch-headscale.md#privacy-and-continuity-limits).

Headscale 0.29.7 leaves Go's HTTP error logger on its default path, which writes the remote address on failed TLS handshakes outside the application log level. The coordinator task now defines the pinned official ARM64 Caddy 2.11.9 image as the only published HTTPS listener. Headscale serves private HTTP over a Docker link with no host port. The proxy discards access and runtime logs, strips client-address forwarding headers, has its admin endpoint disabled and handles certificate issuance with TLS-ALPN-01. The two rootless containers mount their own writable state directories, with the TLS proxy's ACME state on retained EBS. The unchanged upstream Headscale binary still handles the Tailscale POST upgrade. Local ARM64 qualification passed actual client enrollment, trust at the health endpoint, malformed TLS at the proxy and certificate-state reuse across proxy restart. The live replacement passed trusted HTTPS, the controlled log probe and real private enrollment. [Rollout evidence](launch-headscale.md#tls-privacy-rollout--november-19). [Headscale reverse proxy integration](https://headscale.net/stable/ref/integration/reverse-proxy/), [Caddy TLS configuration](https://caddyserver.com/docs/caddyfile/directives/tls).

The private approval workflow reads the pending registration ID on stdin and sends only RSA-OAEP ciphertext through the existing authenticated SSM Run Command path. The diagnostics helper creates a fresh root-only private key in tmpfs, gives it a two-minute validity window and consumes it before decryption. It sends the recovered request on stdin to `grpcurl`, which invokes the fixed `AuthRegister` RPC on Headscale's existing Unix socket. The helper emits a bounded node summary and restores the usual diagnostic lockdown. The workflow went live on November 19 UTC and a disposable client completed native enrollment. The previous deployed helper accepted plaintext command arguments, which can remain in historical command records. [Launch evidence](launch-headscale.md#private-approval-rollout), [Approval operator](../infra/lib/headscale-operator.ts), [Helper](../runtime/ecs/headscale-host.py), [AWS guidance on Run Command inputs](https://docs.aws.amazon.com/systems-manager/latest/userguide/running-commands.html).

The native check found one ciphertext request with its matching one-use handle and zero plaintext registration-ID matches in the test window's SSM request history. The remaining host log and crash audit needs separately scoped synthetic checks. Exit-node preauth keys and OIDC secrets need separate delivery design. DERP admission uses the separate HTTPS `/verify` path.

The gateway fleet has adopted its host-level GuardDuty Runtime Monitoring opt-out. The independent Headscale coordinator retains its official agent, private telemetry endpoint, scoped image pulls and exact-host HEALTHY deployment gate. Agentless EBS scans and shared CloudTrail continue under the existing account policy. [Gateway and coordinator scope](guardduty.md).

### GuardDuty and malware scanning audit — November 19

The 14:36 UTC readback confirmed exact-host Runtime Monitoring `HEALTHY` (agent v1.17.4), `GuardDutyManaged=true`, and all three encrypted volumes eligible under the current EC2 malware scan policy. The regional detector has foundational CloudTrail, DNS and flow analysis plus EBS malware protection enabled. The Headscale VPC, subnet and interfaces have zero customer-configured VPC Flow Logs, and the VPC has zero direct or profile-based Resolver query-log associations. The detector exposes managed data sources independently of those configurations. Headscale host Runtime Monitoring can observe control-channel connection endpoints, the host's DNS traffic, process arguments and file paths. This is a potential device-IP and activity-correlation surface. The AWS event schema establishes visibility into those fields. Actual event contents and retention for this host were outside the audit. [Runtime event types](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring-collected-events.html), [foundational data sources](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_data-sources.html).

The retained 8 GiB application disk is the highest-impact scan surface. A disk copy could contain the SQLite/WAL tailnet inventory, including node identities, advertised endpoints and routes, plus the coordinator Noise private key and ACME state. The replaceable 20 GiB Bottlerocket data disk can contain Docker logs, including the observed address-bearing TLS errors. GuardDuty can scan supported encrypted EBS volumes. A scan creates snapshots and encrypted service-account replicas even with `NO_RETENTION`. AWS documents replica retention up to 55 hours and up to seven days for service failures. The readback found zero scan records for the two known coordinator hosts and zero account-owned snapshots of the three attached volumes. These are customer-visible checks. [Pinned Headscale node schema](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/types/node.go#L38-L123), [supported EBS encryption](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-malpro-supported-volumes.html), [scan data handling](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_malware_protection-ebs-volume-data.html).

Anthony approved the TLS proxy and the volume-only exclusion. The durable stack sets `GuardDutyExcluded=true` on the retained application EBS volume. The tag covers automatic and on-demand scans and gives up malware detection on that disk. The coordinator keeps Runtime Monitoring and both replaceable disks remain eligible. Live verification confirmed the retained volume carries the exclusion and both replaceable disks remain eligible. [Volume-level scan exclusions](https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection-customizations.html).

## Scope and ownership

Ghostline will own the full self-hosted Headscale service and its required AWS networking, DNS/TLS, persistent state, recovery, enrollment automation, access policy, relay map, monitoring and compatible artifacts. Each maintained regional gateway will support a Tailscale exit engine and standalone DERP/STUN when running. A parked deployment has no running engine/relay. Public IPv6 ingress/egress is deferred, matching the existing engines; leakage/failure behavior still requires testing.

Deferring public IPv6 does not imply removing every internal overlay IPv6 setting. Preserve upstream-supported tailnet addressing, and verify that unavailable IPv6 internet destinations fail closed through a selected exit rather than escaping via the client's direct connection.

Use one single-active coordinator in N. Virginia, independently managed from regional gateway tasks and park/destroy operations. The [deployment plan](#coordinator-deployment-proposal--n-virginia) uses the official ARM64 container in ECS on a dedicated Bottlerocket EC2 host with local encrypted EBS. Fargate remains the owner's general preference; local SQLite makes EC2 the selected path for this service. Reuse the maintained Bottlerocket/ECS foundation while keeping the database's single-writer lifecycle independent of gateway blue-green replacement. [Headscale requirements](https://headscale.net/stable/setup/requirements/).

The UDM Pro remains an integration endpoint: home subnet selection, community installation and local recovery need a coordinated home-network work unit. No extra identity-provider service, management UI, load balancer or active-active database is required for the initial deployment. Devices can enroll through Headscale's existing approval/preauth flows.

## Coordinator deployment proposal — N. Virginia

### Official image and release boundary

Use upstream `ghcr.io/juanfont/headscale`, also published as `docker.io/headscale/headscale`; no Ghostline Headscale image build is required. Resolve the newest published stable release on every explicit deployment, exclude drafts/prereleases/development/debug builds and refresh the running service even when a mutable image tag is unchanged. Do not freeze the service to a checked-in version/digest or require a separate promotion to receive new stable releases. If ECR mirroring is used, refresh it in that same deployment rather than allowing an old mirror to become the selector. Record the selected version and actual manifest identity as deployment evidence, not an update hold. [Publisher recipe](https://github.com/juanfont/headscale/blob/v0.29.7/.goreleaser.yml).

The November 17 research snapshot found stable [0.29.7](https://github.com/juanfont/headscale/releases/tag/v0.29.7), a distroless production image and both AMD64/ARM64 manifests. Its OCI index was `sha256:11f81665e842809db9fe3006a38c56a66e968baa5abd4bac498e86445572b970`, with ARM64 manifest `sha256:8f64e19972c001efa48be48a9d81a2f86c4f239767ee3ffd50de119b01fe96f1`. These are observations, not deployment pins or qualification. The coordinator is outside the gateways' seven-artifact release contract. This latest-stable policy applies to Headscale; it does not silently change the regional platform's existing OS/artifact workflow.

Running the published image is a container deployment; these are not different architectures. Two separate facts caused the earlier ambiguity: upstream publishes the runnable application image, but its README discourages/support-limits deploying Headscale in containers. The container installation instructions are community-maintained and unverified by the developers. They run the image directly with `serve`, configuration/data mounts and runtime tmpfs; no derivative image is required. [Container instructions](https://headscale.net/stable/setup/install/container/), [upstream support statement](https://github.com/juanfont/headscale/blob/v0.29.7/README.md#running-headscale).

| Installation | Machine and application layers | Status in this plan |
| --- | --- | --- |
| Upstream recommended native install | EC2 boots a Debian/Ubuntu AMI; install Headscale's DEB package and run its binary as a systemd service. | Explains upstream's recommendation; not the selected Ghostline host recipe. |
| Ghostline container install | EC2 boots a Bottlerocket AMI; ECS runs the official Headscale OCI container image. | Selected architecture; we own its container/persistence qualification. |

An OCI container image is not an EC2 AMI and cannot be selected as the EC2 boot image. Following upstream's recommended native installation would mean changing the host OS/management model, not launching the same container image differently. Keep the chosen Bottlerocket/ECS design: no technical incompatibility has been established by the support statement, and existing container/security operations fit the project. This is a deployment recommendation with explicit upstream support limits, not a claim of official container-install endorsement. Do not convert the immutable Bottlerocket host into an ad hoc systemd/package installation to disguise the difference. [Official native installation](https://headscale.net/stable/setup/install/official/).

### Mirroring the upstream image

Mirroring copies the official executable image into the account's ECR registry without building an application layer. The planned flow is: resolve current stable upstream release, select Linux ARM64, copy its image/config/layers to a dedicated NVA ECR repository, verify copied content and deploy that ECR image. Record source version and actual running content identity. An ARM64 manifest is not the parent multi-architecture index; verify the selected platform correctly rather than treating their different hashes as an application change.

ECR is a registry/availability/IAM/scanning choice, not a requirement caused by the image being unmodified. ECS can pull a supported external-registry image directly. A derived image would instead have a build step and then a normal ECR push; Headscale only needs the copy. Prefer explicit deployment-time mirroring to ECR pull-through cache for this service: pull-through's tag freshness window and stale-cache behavior do not by themselves guarantee latest stable on every deploy. [ECS image sources](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDefinition.html), [ECR push flow](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html), [pull-through refresh behavior](https://docs.aws.amazon.com/AmazonECR/latest/userguide/pull-through-cache.html).

Read-only reference review: `personal-assistant/infra/scripts/mirror-images.ts` contains both a plain `mirrorImage` pull/tag/push path and separate derivative/source builds. Its packaging docs and `infra/test/scripts/mirror-images.test.ts` cover version-label/digest fallback. Reuse the small copy/verification ideas rather than importing that application-specific pipeline or its SSM selection contract. Do not copy an existing-version-tag skip rule without checking current upstream content: a stale local selection or republished source must not defeat the owner's update policy. Do not change the sibling project in this work unit.

### Why SQLite fits this coordinator

SQLite is an embedded transactional SQL database. For one application with moderate write concurrency, it avoids a separate database server, network connection, credentials, patching and availability dependency. Local calls can be efficient, and persistent state can be managed as one coordinated dataset. Headscale stores control-plane identities, membership and policy; it is not writing the relayed user-traffic payload into a database. Its stated scope is a personal/small-organization tailnet, rather than an enterprise multi-writer data platform. These workload characteristics make SQLite a sensible fit here, in addition to upstream's explicit preference. [SQLite's appropriate uses](https://sqlite.org/whentouse.html), [Headscale scope](https://github.com/juanfont/headscale/blob/v0.29.7/README.md#design-goal).

The limit is write concurrency: SQLite permits one writer at a time, while readers can run concurrently. PostgreSQL is often preferable for independent application replicas, heavy concurrent writes or centrally managed shared data. Neither one-headscale-process nor SQLite eliminates disk durability and consistency requirements; WAL and local EBS remain the selected storage design.

### Fargate versus EC2

Fargate supplies an isolated task environment and removes customer host maintenance. Headscale's preferred database changes the fit: the inspected release configuration strongly discourages PostgreSQL for new installations and recommends SQLite WAL. [Fargate isolation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-security-considerations.html), [Headscale database settings](https://github.com/juanfont/headscale/blob/v0.29.7/config-example.yaml#L175-L207).

| Deployment | Persistence consequence | Recommendation |
| --- | --- | --- |
| Fargate + EFS | EFS is a network filesystem; SQLite documents WAL as unsuitable for network filesystems. Disabling WAL would be a different storage design needing explicit qualification. | Do not select for the initial deployment. |
| Fargate + ECS-managed EBS | ECS creates a new volume per task, cannot attach an existing volume, and always deletes service-task volumes on termination. A replacement does not receive the latest live database automatically. | Do not treat this as a persistent database volume. |
| Fargate + RDS PostgreSQL | Technically uses Headscale's PostgreSQL backend, which upstream retains for legacy reasons and discourages for new deployments; also adds a database service. | Do not choose merely to retain Fargate. |
| Bottlerocket/ECS on dedicated EC2 + retained EBS | SQLite/WAL uses a local filesystem; the separate volume can outlive the host and be reattached with one writer. | Selected starting point. |

The EC2 recommendation is an inference from the documented storage constraints, not a claim that Headscale cannot run on Fargate. [SQLite WAL limitation](https://sqlite.org/wal.html), [ECS EBS constraints and deletion](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ebs-volumes.html#ebs-volumes-considerations).

### Proposed resources and operation

- **Compute:** one dedicated ARM64 `t4g.small` in `us-east-1`, official Bottlerocket `aws-ecs-3`, a dedicated ECS cluster and one Headscale service/task. Use ECS scheduling/restart and Bottlerocket APIs/bootstrap rather than a custom host systemd service. Set desired count 1 and stop-before-start deployment (minimum healthy 0%, maximum 100%), with placement restricted to the persistence-ready host. Capacity is an initial proposal; measure memory/CPU before considering a smaller host. Short control-plane update interruptions are accepted by the single-active design. [Bottlerocket ECS variants](https://github.com/bottlerocket-os/bottlerocket/blob/v1.66.0/README.md#variants).
- **Storage:** retain the normal replaceable Bottlerocket root/data disks and add a separately declared, retained encrypted gp3 application volume, initially 8 GiB. Mount the application volume beneath the supported `/mnt` propagation tree, provisionally `/mnt/headscale`; use explicit ECS host `sourcePath` binds for its `lib` directory to container `/var/lib/headscale` and its `config` directory read-only to `/etc/headscale`. SQLite, Noise key, ACME cache and exact configuration/policy/map remain on that volume. Use finite, idempotent bootstrap to validate the exact device/filesystem/ownership and mount before ECS admission. Resolve the exact Nitro serial and kernel major/minor, then create a private device node and validate byte size; container-visible device names can be absent or stale after hotplug. Formatting requires explicit one-time permission for a verified newly created encrypted, no-snapshot volume; revoke that permission and record initialization before any task starts. Do not use an all-zero-byte heuristic: AWS logically empty volumes may contain pseudorandom bytes. Existing state never receives automatic format permission. [AWS empty-volume semantics](https://docs.aws.amazon.com/ebs/latest/userguide/EBSFeatures.html#EBSFeatures_DataSecurity). Format only an explicitly initialized empty volume, never an existing disk during boot. Refuse an absent/wrong mount and an existing database whose Noise key is missing. Reboot, task restart, SELinux access and same-AZ detach/reattach need native qualification without weakening confinement. This is persistent storage, not the ECS-managed task EBS feature whose service volumes are deleted. [Bottlerocket volumes](https://github.com/bottlerocket-os/bottlerocket/blob/v1.66.0/README.md#default-volumes), [mount propagation](https://github.com/bottlerocket-os/bottlerocket/blob/v1.66.0/README.md#mount-propagations-in-bootstrap-and-superpowered-containers), [ECS bind persistence](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html), [EBS AZ scope](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-attaching-volume.html).
- **Network:** a dedicated small VPC/subnet/security group and one retained coordinator EIP, with `server_url: https://ts.bigmantonyd.com` and an A record in the account's existing public `bigmantonyd.com` Route 53 zone. Keep ownership independent of `GhostlineNva` and the regional release mesh. Publish only HTTPS TCP 443. Recommend direct built-in TLS/ACME with `TLS-ALPN-01`, avoiding a load balancer, reverse proxy and public port 80. Regional relays keep their IP-only identities. November 17 read-only checks found zone `Z09531461694R0G93K97`, matching public NS delegation and no exact `ts.bigmantonyd.com` record; DNS creation and certificate issuance are still pending deployment. [Headscale TLS](https://headscale.net/stable/ref/tls/).
- **Application isolation:** non-root container, read-only root filesystem, only the data directory writable, private runtime tmpfs, dropped capabilities and no privileged mode or Docker socket. Publish host 443 to an unprivileged container port. Verify that certificate renewal and the upstream health command work under these restrictions before acceptance.
- **Administration:** SSM/Bottlerocket control with the maintained temporary administrative boundary when needed; no SSH ingress/key pair or public metrics/debug/gRPC administration. Use the local Headscale CLI/socket for initial approval, restoring lockdown after administrative work. Require IMDSv2 and explicitly block the application container from instance credentials; grant only the host/execution roles' required ECS/SSM/image-pull/monitoring permissions. Headscale needs no task IAM role or permanent administrative API key for the first deployment. Preserve independent GuardDuty/CloudTrail and verify this host's coverage.
- **Configuration:** SQLite/WAL; embedded DERP/STUN disabled; explicit initial access policy; manual approval for personal devices. Generate the Noise key once into persistent state and refuse accidental identity replacement on recovery. Coordinator files are mutable application state, separate from regional static Parameter Store identities. Do not enable unrestricted enrollment, route auto-approval or a management UI by default.
- **Initial relay map:** disable the stock public-map URL and seed an explicit static map from existing Ghostline relay IPs/pins. Upstream refuses startup with an empty initial map. Keep relay source restrictions unchanged in this milestone; map automation, `/verify` admission and real relay-path acceptance remain the next milestone. Registration/control-plane tests must not be reported as relay acceptance. [Startup requirement](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/app.go), [map settings](https://github.com/juanfont/headscale/blob/v0.29.7/config-example.yaml#L79-L135).
- **Updates:** resolve latest stable on every deployment, serialize operations, stop the old task and start one writer. Never use overlapping gateway blue-green deployment against this database. Follow required intermediate minor-version migrations to reach current stable rather than skipping an unsupported database transition. Configuration incompatibilities or failed updates are diagnosed explicitly; do not silently retain an old selected release as the normal policy. Automated recovery is deferred; changing the image alone cannot undo a database migration. [Upstream upgrade procedure](https://headscale.net/stable/setup/upgrade/).
- **Recovery follow-up:** after the service works, review `../personal-assistant` backup infrastructure, select suitable consistency/retention/restore behavior and evaluate whether a shared abstraction actually benefits both projects. Schedule, retention period and recovery-time/data-loss objectives are intentionally undecided. Do not make daily snapshots, pre-upgrade snapshot automation, backup/restore commands or a restore drill prerequisites for first service acceptance. Retain and preserve the live application volume from the start; this protects normal host replacement but is not a tested backup against volume loss or bad migrations. Later snapshots must capture consistent complete state. [Snapshot consistency](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-creating-snapshot.html).

Keep these resources declarative in this repository using the current CDK app/config/test conventions and `Project=ghostline`, `Environment=prod`, `System=shared`. Separate durable network/address/state ownership from replaceable compute. Reuse the Bottlerocket/ECS operational foundation while qualifying the coordinator's new persistent-volume path. Defer the personal-assistant backup/code-abstraction review to the recovery work unit; no shared library or copied HA topology is selected now.

### RAM and persistent state

Use the same separation of transient files from durable identity that informs the regional engines, rather than putting all Headscale state in RAM.

| Data | Planned storage | Reason |
| --- | --- | --- |
| SQLite database and its WAL/shared-memory companions | Retained encrypted application EBS, kept together in the database directory | Membership/state must survive process and host replacement; do not split live SQLite components across RAM and disk. |
| Stable Noise private key, ACME account/certificate cache and persistent policy/configuration | Retained encrypted application EBS with narrow ownership/mount access | Recreating them on every boot changes identity or renewal state. |
| Runtime Unix socket, `/run` and `/tmp` scratch | Private bounded tmpfs with host swap disabled | These files have no restart durability requirement. |
| Additional secret-bearing rendered configuration, if needed by the eventual enrollment choice | Consider a private RAM mount backed by an explicit durable secret authority | Minimize transient cleartext copies without pretending the source credential has become ephemeral. |

The DERP implementation uses private RAM. Bootstrap creates the restricted tmpfs, the initializer retrieves its server bundle from Parameter Store directly into RAM and passes it to the renderer through private stdin. DERP mounts its rendered certificate, keys and configuration read-only and needs no writable application disk. The current delivery avoids plaintext ECS environment inputs that the earlier generation persisted in Docker metadata. Native qualification checked specific live storage paths. Historical copies and other host log paths remain separate. [Initializer and residual boundary](secrets.md#ecs-delivery-and-threat-boundary), [ECS mounts](../infra/lib/ecs-stack.ts), [RAM bootstrap](../runtime/ecs/bottlerocket/storage.py).

### Enrollment phases

This decides how a new device, or a device needing reauthentication, proves it may join. It is separate from packet encryption and access policy, and is not a login prompt for every connection.

| Method | Personal-device experience | Administration and dependencies |
| --- | --- | --- |
| Manual approval | Point Tailscale at `https://ts.bigmantonyd.com`; the enrollment waits for approval. | Operator verifies the pending request and approves it for the intended Headscale user through the private CLI/API. No external identity provider is needed; approval is per device rather than unattended sign-up. |
| OIDC/SSO | Browser opens an identity-provider login; a permitted identity can complete registration without a separate CLI approval. | Configure an OIDC client, exact callback `https://ts.bigmantonyd.com/oidc/callback`, explicit allowed identity filters, verified email and PKCE. MFA must be enforced by provider policy; OIDC alone does not turn it on. Adds provider availability and account security to enrollment/reauthentication. |
| Preauth key | A scoped key enrolls a device without browser/interactive approval. | Fits future unattended exit nodes and other services; available independently of the personal-device manual/OIDC decision. Use short-lived, single-use tagged keys where appropriate. |

Anthony selects manual approval for the first personal-device deployment. Add scoped short-lived preauth keys for unattended Ghostline exit nodes in their integration milestone; that automation is independent of human SSO. Google SSO is the stated future preference, not an initial provider/client-credential dependency. Tailnet ACLs remain explicit with either enrollment method. For eventual OIDC, restrict allowed identities, verified email and PKCE; choose node expiration separately from token lifetime and plan existing-user mapping rather than promising a configuration-only switch. [Registration methods](https://headscale.net/stable/ref/registration/), [OIDC filters, PKCE, expiry and identity limits](https://headscale.net/stable/ref/oidc/).

### Launch decisions and follow-ups

| Decision | Selected launch behavior | Later work |
| --- | --- | --- |
| Personal-device enrollment | Manual CLI approval over private administration | Google SSO is desired later; configure provider and existing-user migration at that stage. |
| Service enrollment | No exit-node enrollment required to launch the coordinator | Add scoped preauth automation with Ghostline exits. |
| Recovery | Preserve live volume/identity; automated recovery follows working service | Review personal-assistant, then select backup scope, retention, consistency, restore drill and recovery objectives. |

Region, one active coordinator, `ts.bigmantonyd.com`, Bottlerocket/ECS on EC2, SQLite and latest stable Headscale per deploy are selected. DNS authority is confirmed in the account; direct TLS-ALPN remains the proposed issuance path. Initial instance size, AZ, volume size, exact AMI, explicit image-copy implementation and scoped details can be settled during reviewable implementation; they need not become separate owner approval gates. Coordinator DNS/ACME cache belongs to this service, not to DERP certificate infrastructure.

### Delivery and acceptance

1. Finalize manual-enrollment configuration, the selected hostname/DNS, latest-stable image copy and retained-volume ownership.
2. Implement the dedicated CDK stacks and maintained deploy/status/update commands; qualify container configuration locally with synthetic state and test destructive-operation ownership guards. Do not change regional gateway selectors or services.
3. Review a fresh NVA diff, deploy the coordinator and verify TLS, the local health command, private administration, logging limits and independent security. Approve two disposable clients and verify received control-plane configuration.
4. Prove task restart, host reboot and controlled replacement preserve the mounted volume, Noise identity, registered nodes, policy and endpoint. Verify the old process is stopped before a replacement writer starts. This is persistence qualification, not backup recovery.
5. Accept the working service. Add the separate recovery follow-up using personal-assistant's existing code as a reference; maintained relay-map publication and authenticated DERP access form the next integration milestone. Tailscale exits, home routing, IPv6 and destination concealment remain later work.

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

Tailscale internet egress can SNAT to the AWG-associated private address, so an exit node does not inherently require its own EIP. Sharing public identity is accepted for planning; keep separate container namespaces and qualify replies, UDP mapping/keepalives, exact SNAT, metadata/host isolation and startup quarantine. DERP/STUN mappings are deployed; the Tailscale transport/egress mappings remain planned. Both current Xray/AWG endpoints are preserved.

The implemented network daemon handles destination-aware DERP forwarding. ECS's bridge `PortMapping` reserves a host port without exposing Docker's address-specific `HostIp`, so Xray and DERP use distinct internal host bindings. DERP container TLS 8443 is published internally at host 18443; validated DNAT dispatches the AWG-address public TCP 443 to it while Xray keeps its original endpoint. Internal host ports stay externally blocked. Future Tailscale UDP transport must extend and qualify the same policy. [ECS PortMapping](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html).

The exact account/region quota is **EC2-VPC Elastic IPs**, service `ec2`, code `L-0263D0A3`, under **Amazon Elastic Compute Cloud (Amazon EC2)** in Service Quotas, not VPC. The November 16 readback verifies quota 20 in all 33 reachable enabled commercial regions, including every maintained region; Bahrain remains unverified. Current gateway blue-green uses two retained plus two transient EIPs (four total). The earlier three/six count was conditional on a separate third address, not actual deployed behavior. The coordinator's public address is a separate resource/count. [NVA console entry](https://us-east-1.console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-0263D0A3).

The existing regional gateway uses two EIPs, with two transient allocations during blue-green. DERP/exit listeners are intended to reuse those addresses. NVA's earlier seven-listed/five-quota discrepancy was five customer allocations plus two quota-exempt ALB-managed addresses. The legacy instance/disk/ENI/EIP have since been [retired with an encrypted recovery archive](../.context/knowledge/legacy-insightfulappetite-recovery.md). [Current quota readback](../.context/knowledge/eip-quota-requests.md) verifies all 33 submitted requests approved with applied quota 20, including every maintained region; Bahrain remains unreachable/unsubmitted.

The detailed acceptance checks remain inside the five delivery milestones above: existing-engine continuity, private-map admission, ordinary native client connectivity/selection, state/error behavior, restart/blue-green rollback, stop/start/park/destroy and the later coordinator recovery follow-up. NVA placement, `ts.bigmantonyd.com`, Bottlerocket/ECS, SQLite, latest stable Headscale per deploy and initial manual enrollment are selected. Google SSO is a future preference; recovery objectives and personal-assistant reuse follow the working service. Stable regional Tailscale identity and reuse of existing gateway EIPs are the preferred exit-node PoC direction. Home-destination concealment is deferred.

## Source snapshot and IPv6 watch

November 16 metadata: Headscale v0.29.7 and Tailscale v1.104.7 are classified stable/latest releases. Headscale remains a research candidate; Tailscale v1.104.7 is now qualified for standalone DERP/STUN, which does not qualify its exit-node engine. [Headscale release](https://github.com/juanfont/headscale/releases/tag/v0.29.7), [Tailscale release](https://github.com/tailscale/tailscale/releases/tag/v1.104.7).

Our [Bottlerocket #4954](https://github.com/bottlerocket-os/bottlerocket/issues/4954) is open with zero comments/reactions and no visible new engagement. Broader movement includes [#4984](https://github.com/bottlerocket-os/bottlerocket/issues/4984), [settings SDK #161](https://github.com/bottlerocket-os/bottlerocket-settings-sdk/pull/161), [core-kit #1101](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1101) and the linked settings migration #4985. Those concern ECS agent IP-family selection, not Docker bridge IPv6. The #4984 follow-up is from the contributor requesting CI/maintainer attention. Current core-kit v18.0.0 and `develop` Docker templates still lack the needed bridge settings. [Template](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v18.0.0/packages/docker-engine-29/daemon-json). No equivalent official bridge fix was found/qualified; IPv6 is deferred by owner direction and does not block this plan.

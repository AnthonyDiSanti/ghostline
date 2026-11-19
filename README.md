# Ghostline

A personal connectivity product for ordinary browsing and video, including travel under internet filtering. Anthony is currently in Miami; Oregon is the active primary exit, with NVA as an additional nearby option. Stockholm remains active for testing; Zurich is active after fresh-install validation with independent identities. Cape Town remains a parked on-demand backup. Clients manually choose Xray / VLESS / REALITY or AmneziaWG.

The repo has one regional deployment model: **one Bottlerocket Graviton EC2 host, one shared ECS gateway task, a restricted network daemon and two EIPs**. Every meaningful release temporarily provisions a second host, then uses native ECS blue-green hooks to hand off the two EIPs and retire the source. The seven-image pipeline includes Xray, AWG, private CoreDNS, DERP/STUN, a shared initializer, finite bootstrap and network daemon. The initializer prepares protocol-private RAM configuration; engines mount it read-only, share a formula-derived memory budget and restart independently when eligible. DERP/STUN runs on all four active gateways, reuses each AWG public address and keeps restricted admission until Headscale validation. [Qualification and rollout](docs/derp-poc.md) are complete for the running fleet. ECR retains images, Parameter Store retains identities, and SSM supplies SSH-free administration.

[Architecture](docs/architecture.md) and [ECS runtime](docs/ecs.md) define the model. [Oregon](docs/launch-oregon.md), [Stockholm](docs/launch-stockholm-ecs.md), [Zurich](docs/launch-zurich.md), [Cape Town](docs/launch-cape-town.md) and [NVA](docs/launch-nva.md) record live state and validation. Mac REALITY uses OneXraySE; AWG remains in Amnezia. The four active gateways passed automated encrypted-client and host security checks with GuardDuty Runtime Monitoring excluded and administrative lockdown restored. Earlier Dubai use established OneXraySE sleep/wake stability, IPv4/DNS privacy and native Chrome WebRTC checks. Native Oregon device import/practical acceptance is separate, and IPv6 blocking remains unproven. The accepted device DNS boundary remains unchanged.

The independent [NVA Headscale coordinator](docs/launch-headscale.md) is deployed at `https://ts.bigmantonyd.com`, using the latest stable official image and retained local SQLite. Manual enrollment and native restart/replacement/reboot checks pass. Authenticated relay attachment, exit engines, recovery automation and the confirmed TLS-error logging gap remain follow-ups. [Coordinator commands](docs/headscale.md#coordinator-operations).

From `infra/`, with Node 24 selected:

```sh
npm ci
npm test
npm run deployments
npm run ecs oregon status
```

Use the same target-scoped commands for each region. `stop` retains host/disk/IPs; `park` retains only the endpoint's billable EIPs; `destroy` also releases them. Park preserves images and release support. Complete destroy removes owned regional release resources/images while retaining credentials, expiring logs, GuardDuty and independent CloudTrail. The separate region-scoped `purge-region` command can remove verified Ghostline residuals after destroy; it preserves GuardDuty and shared CloudTrail. Adding a catalog entry allocates nothing. [Development and commands](docs/development.md).

The logging and credential-delivery fixes are deployed on all four active gateways. Xray/CoreDNS/AWG diagnostics are quiet, DERP suppresses upstream client/address output, and the initializer retrieves all three server identities directly into RAM through private stdin. Eight encrypted-client checks, four public DERP/STUN checks and four native security/persistence/isolation probes pass. The tested protocol and temporary task-credential values have zero matches across four bounded persistent stores; existing identities/endpoints and shared protection settings are preserved. Cape Town remains parked with the same ready release. AWS telemetry, historical copies and broader journal/dump/error paths remain separate privacy boundaries. [Fleet release and evidence](.context/scratch/2026-11-17-zero-logs-release/fleet-adoption.md).

Start at the [documentation map](docs/README.md). `infra/` owns CDK/tooling, `runtime/ecs/` owns native fixtures/image recipes, and `.context/` owns live working memory. Secrets and client exports stay under ignored `.local/` or their authorized stores. Parameter Store preserves current identities; client profiles can be re-exported on demand. Total credential loss is handled by explicit new-identity provisioning and device re-enrolment; no LastPass backup requirement applies.

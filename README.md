# Ghostline

A personal connectivity product for ordinary browsing and video, including travel under internet filtering. Anthony is currently in Miami; Oregon is the active primary exit, with NVA as an additional nearby option. Stockholm remains active for testing; Zurich is active after fresh-install validation with independent identities. Cape Town remains a parked on-demand backup. Clients manually choose Xray / VLESS / REALITY or AmneziaWG.

The repo has one regional deployment model: **one Bottlerocket Graviton EC2 host, one ECS gateway task with four application images, a restricted network daemon and two EIPs**. Every meaningful release temporarily provisions a second host, then uses native ECS blue-green hooks to hand off the two EIPs and retire the source. Separate bootstrap and network-daemon images join the common six-image release pipeline. A shared initializer prepares protocol-private RAM configuration; separate engines mount it read-only, share a formula-derived memory budget and restart independently when eligible. A private CoreDNS container handles gateway DNS through authenticated upstream DoT. ECR retains images, regional Parameter Store retains credentials, and SSM supplies SSH-free administration.

[Architecture](docs/architecture.md) and [ECS runtime](docs/ecs.md) define the model. [Oregon](docs/launch-oregon.md), [Stockholm](docs/launch-stockholm-ecs.md), [Zurich](docs/launch-zurich.md), [Cape Town](docs/launch-cape-town.md) and [NVA](docs/launch-nva.md) record live state and validation. Mac REALITY uses OneXraySE; AWG remains in Amnezia. Oregon passes both automated encrypted-client checks, HEALTHY GuardDuty coverage and the November 7 approved host security audit with administrative lockdown restored. Earlier Dubai use established OneXraySE sleep/wake stability, IPv4/DNS privacy and native Chrome WebRTC checks. Native Oregon device import/practical acceptance is separate, and IPv6 blocking remains unproven. The accepted device DNS boundary remains unchanged.

From `infra/`, with Node 24 selected:

```sh
npm ci
npm test
npm run deployments
npm run ecs oregon status
```

Use the same target-scoped commands for each region. `stop` retains host/disk/IPs; `park` retains only the endpoint's billable EIPs; `destroy` also releases them. Park preserves images and release support. Complete destroy removes owned regional release resources/images while retaining credentials, expiring logs, GuardDuty and independent CloudTrail. The separate region-scoped `purge-region` command can remove verified Ghostline residuals after destroy; it preserves GuardDuty and shared CloudTrail. Adding a catalog entry allocates nothing. [Development and commands](docs/development.md).

Start at the [documentation map](docs/README.md). `infra/` owns CDK/tooling, `runtime/ecs/` owns native fixtures/image recipes, and `.context/` owns live working memory. Secrets and client exports stay under ignored `.local/` or their authorized stores. Parameter Store preserves current identities; client profiles can be re-exported on demand. Total credential loss is handled by explicit new-identity provisioning and device re-enrolment; no LastPass backup requirement applies.

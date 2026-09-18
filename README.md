# Ghostline

A personal connectivity PoC for browsing and video from Dubai under current internet filtering. Stockholm is the primary exit and Cape Town is the backup. Clients manually choose Xray / VLESS / REALITY or AmneziaWG.

The repo has one regional deployment model: **one AL2023 Graviton EC2 host, one ECS gateway task, three images and two EIPs**. A shared initializer prepares protocol-private RAM configuration; separate engines mount it read-only, share a formula-derived memory budget and restart independently when eligible. ECR retains images, regional Parameter Store retains credentials, and SSM supplies SSH-free administration.

[Architecture](docs/architecture.md) and [ECS runtime](docs/ecs.md) define the model. [Stockholm](docs/launch-stockholm-ecs.md) and [Cape Town](docs/launch-cape-town.md) record live state and validation. Mac REALITY uses OneXraySE; AWG remains in Amnezia. Repeated Mac sleep/wake validation remains open.

From `infra/`, with Node 24 selected:

```sh
npm ci
npm test
npm run deployments
npm run ecs stockholm-ecs status
```

Use the same target-scoped commands for each region. `stop` retains host/disk/IPs; `park` retains only the endpoint's billable EIPs; `destroy` also releases them. Durable images and credentials survive endpoint removal. Adding a catalog entry allocates nothing. [Development and commands](docs/development.md).

Start at the [documentation map](docs/README.md). `infra/` owns CDK/tooling, `runtime/ecs/` owns native fixtures/image recipes, and `.context/` owns live working memory. Secrets and client exports stay under ignored `.local/` or their authorized stores. Anthony intermediates LastPass activity.

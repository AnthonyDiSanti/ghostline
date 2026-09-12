# Ghostline

A personal connectivity experiment: find out whether a privately hosted tunnel provides stable browsing and video from Dubai under Anthony's current internet filtering.

The deployed setup has **Stockholm as the primary exit and Cape Town as a slower backup, each with one EC2 instance and two Elastic IPs**. Both run Ghostline-managed Xray / VLESS / REALITY and AmneziaWG, with manual protocol selection in off-the-shelf clients.

Stockholm runs [ECS on AL2023](docs/ecs.md), using ECR releases, regional Parameter Store credentials and SSH-free administration. Cape Town retains the Ubuntu 24.04 / Docker Compose runtime. CDK owns both regional deployments.

## Current status

Stockholm cutover completed on 2026-09-12 after owner acceptance of both ECS protocols/IP masquerading and unattended stop/start/park/rebuild validation. The old Ubuntu Stockholm host, disk, networking and both EIPs are removed. Native Mac REALITY and guarded AWG tests pass through the ECS addresses; the familiar Stockholm profile names now point there. REALITY is selected and the VPN was left disconnected. See [current Stockholm evidence](docs/launch-stockholm-ecs.md) and [Cape Town evidence](docs/launch-cape-town.md). Frankfurt is also retired.

Use `npm run ecs stockholm-ecs <action>` for the primary, including `start`, `stop`, `deploy`, `verify` and `profiles`. `park <target>` removes host/disk/networking while retaining billable IPs; `destroy <target>` also releases those IPs. ECS redeployment restores credentials automatically from Parameter Store and images from ECR; both durable stores survive endpoint removal. The catalog's `stockholm` entry is the retired Ubuntu recipe. Adding a catalog entry allocates nothing.

With Node 24 selected, run `cd infra && npm ci && npm test`. Deployment inputs and commands are in [development](docs/development.md).

## Start here

- [Documentation map](docs/README.md) — route by task.
- [Product scope](docs/product.md) — objective, accepted limitations, and success evidence.
- [Architecture](docs/architecture.md) — initial deployment and runtime ownership.
- [Development](docs/development.md) — TypeScript/npm/CDK commands and verification.
- [Reference reuse](docs/reference-reuse.md) — what to adapt from personal-assistant and what to leave behind.

## Repository

- `docs/`: current project specifications and historical source inputs.
- `.context/`: live status, decisions, and compact agent knowledge.
- `AGENTS.md`: coding-agent workflow and routing.
- `infra/`: executable CDK project and offline tests.
- `runtime/`: container recipes and host installation inputs; credentials stay under ignored `.local/`.

Anthony is the sole administrator. Use explicit named deployment targets in the existing account. There is no second host per endpoint, automatic protocol switching, custom client or rollback framework.

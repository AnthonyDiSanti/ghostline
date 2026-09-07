# Ghostline

A personal connectivity experiment: find out whether a privately hosted tunnel provides stable browsing and video from Dubai under Anthony's current internet filtering.

The selected next shape is **one Ubuntu 24.04 EC2 instance and two Elastic IPs in Cape Town**, with Ghostline-managed Xray / VLESS / REALITY and an AmneziaWG alternative. Switch protocols manually in off-the-shelf clients. CDK owns AWS resources; Docker Compose and npm helpers own runtime installation and preserved credentials.

## Current status

Cape Town Xray now runs on the fresh Ghostline-managed host with its original identities and EIP. Reinstall, reboot, native Mac exit-IP and HTTPS checks passed. Anthony validated the unchanged macOS/iOS profiles after migration. Work is paused for his commit; the original host remains until the next work unit, when it will be retired before installing AmneziaWG. See [runtime workflow](docs/runtime.md) and [Cape Town evidence](docs/launch-cape-town.md) for the actual checkpoint state. Frankfurt was retired, including its EIP; its recipe remains available but is not live.

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

Anthony is the sole administrator. Use explicit named deployment targets in the existing account. No second permanent server, automatic protocol switching, ECS/ECR platform, custom client or rollback framework is included in this work unit.

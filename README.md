# Ghostline

A personal connectivity experiment: find out whether a privately hosted tunnel provides stable browsing and video from Dubai under Anthony's current internet filtering.

The deployed setup has **Stockholm and Cape Town exits, each with one Ubuntu 24.04 EC2 instance and two Elastic IPs**, with Ghostline-managed Xray / VLESS / REALITY and an AmneziaWG alternative. Switch protocols manually in off-the-shelf clients. CDK owns AWS resources; Docker Compose and npm helpers own runtime installation and preserved credentials.

## Current status

Stockholm is deployed as the primary trial; Cape Town remains a slower backup. The live Stockholm park/redeploy test preserved both EIPs and rebuilt its host. Both server runtimes pass configuration/SNAT/egress checks. Mac Xray passed exit/HTTPS. After an initially interrupted AWG trial, two guarded native reconnects passed expected-exit/HTTPS checks, including session renewal; one brief ping/DNS loss was observed. The original outage was not reproduced. Automatic test recovery restored direct internet, and the Mac is left disconnected. iOS and owner practical speed trials remain pending. See [Stockholm evidence](docs/launch-stockholm.md), [runtime workflow](docs/runtime.md) and [Cape Town evidence](docs/launch-cape-town.md). Frankfurt is retired.

Use `park <target>` to remove host/disk/networking and retain the same billable IPs; use `destroy <target>` to release a disposable PoC deployment completely. `deploy <target>` restores infrastructure; runtime installation restores saved credentials. Adding a catalog entry allocates nothing.

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

Anthony is the sole administrator. Use explicit named deployment targets in the existing account. No second host per regional endpoint, automatic protocol switching, ECS/ECR platform, custom client or rollback framework is included in this work unit.

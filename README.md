# Ghostline

A personal connectivity experiment: find out whether a privately hosted tunnel provides stable browsing and video from Dubai under Anthony's current internet filtering.

Use **one EC2 instance and one Elastic IP per exit**, initially Frankfurt and now a parallel Cape Town trial, running an Amnezia-managed Xray / VLESS / REALITY endpoint. Provision the instance and basic networking with AWS CDK in TypeScript. Test macOS and iOS first. If it works, use the observed configuration and product choices to build our own deterministic container deployment and eventually remove Amnezia as the server installer/manager.

## Current status

Frankfurt and Cape Town are deployed with Amnezia-managed XRay, one EC2 instance and retained EIP each. Anthony reported macOS and iOS practical tests passed for both; native Mac exit/HTTPS and switching between them also pass. Cape Town is the selected [privacy-oriented exit trial](docs/region-selection.md), preserving Frankfurt. See [Frankfurt](docs/launch.md) and [Cape Town](docs/launch-cape-town.md) launch evidence.

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

Anthony is the sole administrator. The initial target is independent minimal endpoints and two devices in the existing production AWS account, with explicit named deployment targets. No HA, orchestration platform, custom client, or recovery automation is required to establish whether the experiment works.

# Ghostline

A personal connectivity experiment: find out whether a privately hosted tunnel provides stable browsing and video from Dubai under Anthony's current internet filtering.

Start with **one EC2 instance and one Elastic IP in Frankfurt**, running an Amnezia-managed Xray / VLESS / REALITY endpoint. Provision the instance and basic networking with AWS CDK in TypeScript. Test macOS and iOS first. If it works, use the observed configuration and product choices to build our own deterministic container deployment and eventually remove Amnezia as the server installer/manager.

## Current status

Design and reference-repository review only. No infrastructure code, npm package, deployment, or measured connectivity exists yet. This repository does not currently have executable setup or test commands.

## Start here

- [Documentation map](docs/README.md) — route by task.
- [Product scope](docs/product.md) — objective, accepted limitations, and success evidence.
- [Architecture](docs/architecture.md) — initial deployment and runtime ownership.
- [Development](docs/development.md) — intended TypeScript/npm/CDK conventions and first implementation sequence.
- [Reference reuse](docs/reference-reuse.md) — what to adapt from personal-assistant and what to leave behind.

## Repository

- `docs/`: current project specifications and historical source inputs.
- `.context/`: live status, decisions, and compact agent knowledge.
- `AGENTS.md`: coding-agent workflow and routing.
- `infra/`: planned CDK project; create during implementation.

Anthony is the sole administrator. The initial target is one endpoint and two devices in the existing production AWS account, with Frankfurt as the default region. No HA, orchestration platform, custom client, or recovery automation is required to establish whether the experiment works.

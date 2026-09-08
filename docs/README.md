# Ghostline documentation

Read by task. These documents are the current project specification, incorporating Anthony's 2026-09-07 corrections to the upstream v0.3 proposal. They distinguish selected behavior from observed deployment/device evidence.

| Task | Read | Owns |
| --- | --- | --- |
| Understand what to build and what counts as success | [Product](product.md) | Scope, devices, privacy intent, accepted limitations, follow-ons |
| Choose or change infrastructure/runtime ownership | [Architecture](architecture.md) | EC2 topology, Amnezia reference phase, configuration/secrets boundaries |
| Scaffold, write, or verify implementation | [Development](development.md) | Code layout, npm command contract, testing, first implementation sequence |
| Migrate credentials or install owned containers | [Runtime](runtime.md) | Local bundles, pinned builds, client imports, protocol installation and verification |
| Compare Fargate, stopped EC2 and cold rebuild costs | [Lifecycle assessment](deployment-lifecycle.md) | Protocol compatibility, Cape Town price model and on-demand management tradeoffs |
| Reuse personal-assistant code or conventions | [Reference reuse](reference-reuse.md) | Source locations, adaptation decisions, possible shared components |
| Inspect deployed resources, launch actions and device evidence | [Frankfurt launch/retirement](launch.md), [Cape Town launch](launch-cape-town.md) | Per-target lifecycle state, nonsecret observations and remaining trial work |
| Select an endpoint country against destination privacy requirements | [Region assessment](region-selection.md) | Age-verification research, candidate rationale and migration constraints |
| Understand the provenance of earlier requirements | [Historical inputs](archive/README.md) | Original upstream documents; not implementation requirements |

## Documentation boundaries

- Keep one authoritative home for each concern; link instead of duplicating decision tables.
- Current specifications outrank archived inputs. New owner decisions update the relevant topic and leave a rationale breadcrumb in the working-memory decision log.
- Distinguish selected direction, proposed engineering defaults, and observed results. Do not describe planned files or commands as implemented.
- Record launch activities and observed settings when launch occurs. Do not prebuild an operations manual for an unproven setup.
- Add a topic only when it has content worth retrieving. Keep this flat map until the project needs subdirectories.

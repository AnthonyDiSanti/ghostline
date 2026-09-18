# Ghostline documentation

Current specifications describe one regional ECS gateway architecture. Git history owns superseded approaches; do not keep old deployment recipes as agent-facing alternatives.

| Task | Read |
| --- | --- |
| Understand product intent and evidence limits | [Product](product.md) |
| Change regional topology, ownership or cost tags | [Architecture](architecture.md) |
| Understand containers, RAM, networking, memory and recovery | [ECS gateway](ecs.md) |
| Build, test, deploy or add another region | [Development](development.md) |
| Inspect image provenance and release policy | [Images](images.md), [runtime notice](../runtime/NOTICE.md) |
| Import credentials or review their security boundary | [Secrets](secrets.md) |
| Stop, rebuild, park or release an exit | [Lifecycle](deployment-lifecycle.md) |
| Inspect live regional identities and validation | [Stockholm](launch-stockholm-ecs.md), [Cape Town](launch-cape-town.md) |
| Diagnose Mac crashes or review client selection | [Mac stability](mac-client-stability.md), [v2rayN assessment](v2rayn-assessment.md) |
| Select a region against privacy/performance needs | [Region assessment](region-selection.md) |
| Reuse personal-assistant conventions | [Reference reuse](reference-reuse.md) |

Stable behavior belongs here; live work, decisions and follow-ups belong in `.context/`. Keep source attribution and current evidence, remove superseded instructions, and never store credentials or sensitive diagnostics in either location. Client/region research is separate from the deployment architecture.

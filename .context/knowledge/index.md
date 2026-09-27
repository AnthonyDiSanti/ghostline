# Supplemental knowledge

Consult before infrastructure/vendor work. Current behavior belongs in `docs/`; git history owns superseded implementations.

- [Production host platform](../../docs/platform.md) — qualified Bottlerocket OS/platform selection, durable regional image publication, bootstrap/daemon boundaries and diagnostic lockdown.
- [Bootstrap pattern audit and upstream issue](../scratch/2026-09-22-coordinated-release/bootstrap-pattern-audit.md) — supported native bootstrap use, the reproduced host-ctr snapshot gap, exact uncertainty, upstream PR and accepted temporary recovery exception.
- [Host OS evaluation](host-os-evaluation.md) — Bottlerocket versus AL2023/other hosts, current GuardDuty support, custom network/RAM security tradeoffs and validated isolated trial; blue-green follows.
- [ECS gateway](../../docs/ecs.md) — shared task/initializer, per-engine restarts, private RAM, common memory budget, bridge identity and lifecycle constraints.
- [Account CloudTrail](../../docs/cloudtrail.md) — discover/reuse organization/shadow coverage, preserve external ownership, converge on a finite-retention neutral baseline; shared migration verified live.
- [GuardDuty](../../docs/guardduty.md) — live service/telemetry discovery, accepted capability gaps, enable-only defaults, tagged enrollment and bounded coverage checks.
- [On-demand lifecycle research](on-demand-lifecycle.md) — protocol presence limits, exact-version Xray/AWG signals, renewable leases, controller strategies and reporting/IAM tradeoffs; proposal only.
- [Regional lifecycle](../../docs/deployment-lifecycle.md) — retention/release ownership, EIP adoption, GuardDuty-created deletion dependencies, publisher aliases across regions and optional expiration questions.
- [Image provenance and policy](../../docs/images.md) — stable build resolution, official Xray mirror, native AWG source build, exact-artifact publication tests and provenance limits.
- [ECR placement, cost and retention](ecr-placement.md) — live inventory, completed cleanup, full regional price CSV, proposed reusable publisher pair, retention and regional-outage/cache limits.
- [Event-driven releases](event-driven-releases.md) — AWS source findings and selected ownership/rollback/retention boundaries; implementation contract in [release workflow](../../docs/releases.md).
- [ECR replication cluster plan](../scratch/2026-09-22-ecr-replication-cluster/plan.md) — incorporated into coordinated release work: live full-mesh, whole-stack expansion and union retirement verified; NVA/London retained.
- [Secret boundary](../../docs/secrets.md) — six regional parameters, portable import directory, exact execution-role scope, read-only mounts and residual environment metadata.
- [Development fixtures](../../docs/development.md#typescript-and-npm) — native scripts, explicit rendering, recursive syntax/lint checks and real-file tests.
- [Stockholm evidence](../../docs/launch-stockholm-ecs.md), [Cape Town evidence](../../docs/launch-cape-town.md) — actual resource identities and tested behavior; read before cloud changes.
- [Mac client stability](../../docs/mac-client-stability.md) — OneXraySE routing/awake tests, crash evidence, unsafe retired watchdog and release-watch criteria.
- [v2rayN assessment](../../docs/v2rayn-assessment.md) — conditional alternative client, REALITY/AWG compatibility and security tradeoffs.
- [Protocol selection](protocol-selection.md) — reasons for AWG as the manual stealth alternative.
- [Reference repository](reference-repository.md) — personal-assistant source map, cost tags and fixture patterns.
- [Region assessment](../../docs/region-selection.md) — performance/privacy research and evidence limits, separate from deployment implementation.

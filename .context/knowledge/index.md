# Supplemental knowledge

Consult before infrastructure/vendor work. Current behavior belongs in `docs/`; git history owns superseded implementations.

- [ECS gateway](../../docs/ecs.md) — shared task/initializer, per-engine restarts, private RAM, common memory budget, bridge identity and lifecycle constraints.
- [Regional lifecycle](../../docs/deployment-lifecycle.md) — retention/release ownership, EIP adoption, publisher aliases across regions and optional expiration questions.
- [Image provenance and policy](../../docs/images.md) — official Xray mirror, native AWG source build, three immutable artifacts and stable-channel follow-up.
- [Secret boundary](../../docs/secrets.md) — six regional parameters, portable import directory, exact execution-role scope, read-only mounts and residual environment metadata.
- [Development fixtures](../../docs/development.md#typescript-and-npm) — native scripts, explicit rendering, recursive syntax/lint checks and real-file tests.
- [Stockholm evidence](../../docs/launch-stockholm-ecs.md), [Cape Town evidence](../../docs/launch-cape-town.md) — actual resource identities and tested behavior; read before cloud changes.
- [Mac client stability](../../docs/mac-client-stability.md) — OneXraySE routing/awake tests, crash evidence, unsafe retired watchdog and release-watch criteria.
- [v2rayN assessment](../../docs/v2rayn-assessment.md) — conditional alternative client, REALITY/AWG compatibility and security tradeoffs.
- [Protocol selection](protocol-selection.md) — reasons for AWG as the manual stealth alternative.
- [Reference repository](reference-repository.md) — personal-assistant source map, cost tags and fixture patterns.
- [Region assessment](../../docs/region-selection.md) — performance/privacy research and evidence limits, separate from deployment implementation.

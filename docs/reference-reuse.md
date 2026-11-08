# personal-assistant reuse

The reference is `../personal-assistant`, reviewed read-only at commit `3517fa6` plus its existing dirty working tree on September 7 and 15, 2026. It was neither changed nor tested. Its working memory is `context/`; inspect actual source before trusting older knowledge notes.

Ghostline adapts its TypeScript/npm, thin CDK entrypoint, explicit configuration, focused assertions, fixture validation and cost-tag conventions. There is no shared package or cross-repository build dependency. Its application-specific network, HA, backup and governance topology is inappropriate for this one-host gateway.

## Source map

Paths are relative to the reference repository. Consult these when a concrete reuse opportunity arises; they are not requirements to import the larger framework.

| Sources | Adopted principle |
| --- | --- |
| `infra/package.json`, `tsconfig.json`, `vitest.config.ts` | Strict ESM/NodeNext TypeScript, npm under infra, tsx and Vitest |
| `infra/bin/infra.ts`, `lib/app.ts` | Thin CLI and the same testable app builder in commands and tests |
| `infra/test/infra.test.ts`, `test/support/template-utils.ts` | Focused CloudFormation assertions including inline/standalone ingress |
| `infra/test/support/synth.ts`, `scripts/synth-test.ts` | Fresh offline synthesis with explicit dummy account inputs and matching CDK feature flags; no cache/worker framework |
| `infra/lib/deployment-profile.ts`, `lib/ssm-params.js`, `scripts/init-openclaw.ts` | Validated nonsecret configuration, scoped secret references, no-overwrite imports and redacted failures |
| `infra/deployments/profiles/anthony.json`, `lib/app.ts` | Exact Project/Environment/System billing dimensions |
| `infra/scripts/lint-container-assets.ts` | Recursive discovery, syntax, ShellCheck and Hadolint in the regular gate; native tools with Docker fallback |
| `infra/test/scripts/{openclaw-gateway-entrypoint,openclaw-admin-helpers,workspace-git-smoke}.test.ts` | Execute actual scripts with disposable files; substitute external process boundaries |

## Billing contract

The reference applies `Project=personal-assistant`, `Environment=prod` and default `System=shared`. Ghostline applies `Project=ghostline`, `Environment=prod`, and resource-owned `System=shared`, `xray` or `amneziawg`. Global tags cannot override System. Host root volumes receive explicit propagated tags. These shared dimensions support consolidated analysis without encoding region or deployment mode into the tag schema. See [architecture](architecture.md#resource-and-billing-identity).

## Fixture validation

Ghostline uses one stdlib Python runner for recursive shell/Python/Dockerfile discovery. ShellCheck and Hadolint Docker fallbacks are digest-pinned and mount only selected source copies read-only, with networking disabled. All severities fail. Python syntax targets the portable Python 3.9 grammar. Tests execute real fixtures with synthetic credentials and verify failure propagation and cleanup. [Development](development.md#asset-verification) owns the current commands and prerequisites.

## Extraction boundary

No common networking library is justified: the reference’s ECS/ALB/NAT topology is not a second consumer of this gateway. A secret-import utility, test-phase runner or small Lambda/custom-resource helper could become shared only when both projects need it. Keep product-specific catalogs, IAM assumptions, retention settings and OpenClaw operations out of a generic component.

Reference notes can be stale: some mention Jest or `.mjs` while live files use Vitest and `.ts`. Bin-link/sandbox repair scripts address specific observed failures and should not become automatic Ghostline installation hooks. Current image release policy belongs in [images](images.md), not inherited reference pinning guidance.

## CDK construct review — November 7, 2026

Reviewed current Ghostline source and the sibling's current construct implementations read-only. Overall structure is appropriate: the catalog reuses `EcsEndpointStack` across four endpoints, while `RegionalReleaseStack`/`ImageDistribution` and `HostSlotStack` separate durable release resources from disposable gateway/host lifecycles. The notifications package already captures a coherent resource/runtime/security pattern. Functions such as `hostSlotAuthority` and `rolloutInfrastructure` are valid reusable CDK building blocks without needing additional classes.

The strongest small cleanup is a local Lambda/logging factory around the repeated Node.js runtime, lockfile, explicit retained log group and bundling setup in release Gate/DeploymentHook. Keep the notifications package self-contained initially; sharing its handler recipe would require another package boundary decision rather than an upward dependency on `infra/lib`. Keep IAM, architecture, concurrency, timeouts, retries and retention visible at each consumer. A factory can preserve current scopes/IDs more easily than adding another construct level. The sibling's `ManagedNodejsFunction` and provider helpers are useful references, but not drop-in dependencies: they externalize the runtime AWS SDK and use different log retention/removal defaults, while Ghostline bundles its selected SDK and uses one-week retained logs. Share across projects only after agreeing the actual contract in both consumers; neither repository was changed to consume a common library here.

A project-local `GatewayWorkload` construct is a reasonable later cohesion improvement for the initializer, engines, DNS, execution-role secret grants, RAM mounts and service startup/deployment dependencies currently in `ecs-stack.ts`. Its purpose would be keeping security invariants together and making the stack easier to read, not eliminating copied regional recipes; those do not exist. Preserve network/EIP/host lifecycle boundaries and do not turn it into a generic ECS/Fargate framework. A similar release-controller grouping is optional; the current helper boundaries already separate much of its complex authority.

The deeper review recommends starting GatewayWorkload as a factory/module at the existing resource scope, avoiding a new construct-path migration. Anthony requested separate thumbs-up/down decisions before implementation. [Concrete contracts, examples, tradeoffs and acceptance gates](../.context/scratch/2026-11-07-cdk-abstractions/proposals.md) cover the Lambda factory, workload module and new-region initialization CLI; Anthony approved 1 and 3 and deferred 2. The local Lambda factory is implemented with identical full templates/assets across 16 scenarios and zero live release-stack differences in all six regions. The initializer is implemented; its explicit NVA trial passed initialization/retry, host/security, encrypted-client and owner practical acceptance before retirement. The subsequent maintained NVA enrollment also passes both actual native Mac connections with original routing restored. [Maintained launch](launch-nva.md).

Defer a shared GuardDuty construct until the privacy review establishes the desired collection boundary and another consumer needs the same transport/enrollment contract. The sibling's Fargate integration is not a second instance of Ghostline's Bottlerocket endpoint/host setup. Keep independent account detector/CloudTrail discovery and enable-only reconciliation outside application constructs; a new application-owned security stack would change ownership, not merely deduplicate syntax.

The more visible operational repetition is new-region initialization: the Oregon/Zurich generation and private alert-contact helpers were local operator scripts. The explicit initialization CLI inventories, refuses conflicting identities, generates/imports an explicitly requested fresh set and initializes the approved contact before ordinary activation. This belongs in operator tooling, not synthesis or a credential-generating CloudFormation custom resource. See the [initialization contract](development.md#explicit-regional-initialization) for reviewed plans, interrupted-import recovery and staging lifetime.

[AWS's construct guidance](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html) supports composing logical units while retaining stacks as deployment boundaries. Any extraction must preserve deployed logical/physical identities: [construct paths contribute to logical IDs](https://docs.aws.amazon.com/cdk/v2/guide/identifiers.html). Compare complete active/parked templates, user-data and release identities before/after; do not deploy an ostensibly cosmetic regrouping that replaces existing endpoints. The initial assessment changed documentation only; subsequent approved implementation and live-trial status are recorded in the handoff.

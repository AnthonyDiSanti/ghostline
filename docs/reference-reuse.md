# personal-assistant reuse review

Read before copying scaffolding, scripts, or CDK constructs. Reviewed 2026-09-07 against the local `../personal-assistant` working tree, based on commit `3517fa6` with existing uncommitted changes. No changes or tests were run in that repository. This was a focused infrastructure/tooling review, not an application audit.

## Conclusion

Adapt the TypeScript/npm/testing and configuration principles. Build Ghostline's first EC2 stack directly using CDK. No existing custom construct is necessary for the initial Amnezia experiment, and no shared package should block it.

The reference repository's working memory is `context/`, not `.context/`. Its canonical infrastructure docs and live code are more reliable than older knowledge notes. Ghostline keeps its own `.context/` convention.

## Reuse map

Paths below are relative to the reference repository; the links work when it is checked out beside Ghostline. They are review references, not runtime/build dependencies.

| Source | Disposition | Reason / adaptation |
| --- | --- | --- |
| [infra/package.json](../../personal-assistant/infra/package.json), [tsconfig.json](../../personal-assistant/infra/tsconfig.json), [vitest.config.ts](../../personal-assistant/infra/vitest.config.ts) | Adapt now | npm under infra/, TypeScript ESM/NodeNext, tsx, Vitest. Use only needed dependencies and command lanes; make noEmit consistent for build/watch. |
| [infra/bin/infra.ts](../../personal-assistant/infra/bin/infra.ts), [lib/app.ts](../../personal-assistant/infra/lib/app.ts) | Adapt shape | Thin CLI plus shared app builder. Pass a small typed configuration; omit its multi-stack graph and product-specific branching. |
| [infra/test/infra.test.ts](../../personal-assistant/infra/test/infra.test.ts), [test/support/template-utils.ts](../../personal-assistant/infra/test/support/template-utils.ts) | Adapt selectively | Focused CDK assertions; ingress collection handles both inline and standalone CloudFormation rules. Copy a helper only when its test needs it. |
| [infra/test/support/synth.ts](../../personal-assistant/infra/test/support/synth.ts), [scripts/synth-test.ts](../../personal-assistant/infra/scripts/synth-test.ts), [scripts/ensure-test-synth.ts](../../personal-assistant/infra/scripts/ensure-test-synth.ts) | Simplify substantially | Reuse explicit dummy inputs and matching CDK feature flags. Skip disk caches, worker locks, and repeated configuration catalogs for one small stack. |
| [infra/scripts/test-all.ts](../../personal-assistant/infra/scripts/test-all.ts) | Reuse command convention | One full npm test entrypoint is useful. Its runner embeds OpenClaw phases and output parsing; ordinary npm composition is enough initially. |
| [infra/lib/deployment-profile.ts](../../personal-assistant/infra/lib/deployment-profile.ts), [lib/ssm-params.js](../../personal-assistant/infra/lib/ssm-params.js) | Reuse principles | Validated nonsecret configuration, namespaced secret references, explicit overrides. The implementations depend on Cognito/OpenClaw/Asana/Signal catalogs and are not generic profile libraries. |
| [infra/scripts/init-openclaw.ts](../../personal-assistant/infra/scripts/init-openclaw.ts), [its tests](../../personal-assistant/infra/test/scripts/init-openclaw.test.ts) | Later pattern | Useful no-overwrite intent, dependency injection, and redacted failures. Replace its product-specific targets and CLI secret arguments if adapting to a generic SDK-based secret initializer. |
| [infra/lib/network-stack.ts](../../personal-assistant/infra/lib/network-stack.ts) | Do not reuse | Two AZs, two NAT gateways, four subnet groups, interface endpoints, internal ALB/DNS/TLS, and OpenClaw coupling exceed Ghostline's one-host needs. |
| [infra/lib/constructs/managed-nodejs-function.ts](../../personal-assistant/infra/lib/constructs/managed-nodejs-function.ts), [lambda-log-group.ts](../../personal-assistant/infra/lib/constructs/lambda-log-group.ts) | Reusable later, not needed now | Small Lambda/log-group composition. Ghostline needs no Lambda in the initial endpoint; retention and SDK bundling choices must remain explicit if adopted. |
| [infra/lib/constructs/on-event-provider.ts](../../personal-assistant/infra/lib/constructs/on-event-provider.ts), [provider-scaffolding.ts](../../personal-assistant/infra/lib/constructs/provider-scaffolding.ts) | Reusable later, not needed now | Generic custom-resource provider wiring; existing provider logs retain for two years. No initial custom resource justifies bringing this in. |
| `infra/lib/constructs/backup-*`, `efs-tiered-backup-vaults.ts`, notification helpers; Data/Edge/Governance/App stacks | Leave behind | Backup tiers, telemetry, application auth, EFS/ECS and operational topology do not serve the initial tunnel experiment. |
| `infra/scripts/mirror-images.ts`, `scripts/lib/config-fingerprint.ts`, Docker wrappers | Revisit for owned runtime | Immutable inputs/fingerprints may become useful after Amnezia. Current code is tied to OpenClaw images, plugins, SSM groups and deployment discovery. |
| `infra/scripts/fix-bin-links.ts`, `agents-session-env.sh` | Troubleshooting references only | Machine/sandbox remedies, not automatic installation hooks for a clean Ghostline setup. Apply only to an observed problem. |

## Potential components benefiting both projects

These are candidates for later extraction, not planned prerequisites:

- **Parameter Store secret initializer:** accept explicit names/region, injectable SDK client and value generator, prohibit accidental overwrite, and redact failures. Keep secret values out of process argv. Useful when Ghostline owns runtime secrets and personal-assistant consolidates its initializers.
- **Test phase runner:** accept a small phase/dependency configuration and provide prefixed output, exit aggregation, and timings. Extract only if Ghostline's checks become slow/complex enough to benefit; do not ship OpenClaw phases in a shared runner.
- **Managed Lambda/custom-resource helpers:** the existing constructs are the clearest potential IaC library material. Extract with their tests only when Ghostline has a real Lambda/custom-resource consumer. Make retention/removal and bundling policies configurable rather than inheriting application defaults implicitly.

A generic networking or VPN-host library is not justified by the two projects today: personal-assistant's ECS/ALB topology is not a second consumer of Ghostline's EC2 endpoint. Prefer small local code over a package maintained for hypothetical reuse.

## Lessons worth preserving

- Separate stack wiring from reusable constructs and deployment constants. A single stack can still have clean ownership.
- Tests should instantiate the same app builder and feature flags as the CLI; dummy account/region values avoid dependence on a live AWS session.
- Use fine-grained assertions over broad snapshots. The reference suite's counts and allowlists are specific to its production architecture, not portable policy.
- Avoid carrying the reference synth cache forward: test configuration is repeated, cache source lists omit the lockfile, and mtime-based reuse adds correctness obligations unnecessary for this stack.
- Prefer deliberate dependency updates and pinned runtime image inputs when we own deployment. Do not assume a Lambda runtime major version alone fixes the behavior of an externalized AWS SDK.
- The reference knowledge note still calls its invariant tests Jest, but package.json/config use Vitest. Some command-catalog paths retain `.mjs` names while the current scripts use `.ts`. Treat notes as leads and verify against live files.

## Implementation boundary

No source code was copied this turn. The adopted project conventions are specified in [development](development.md); the initial resource shape is in [architecture](architecture.md). Revisit this map when implementation creates a concrete reuse opportunity, not as a requirement to extract every candidate.

## Implemented billing reuse

`infra/deployments/profiles/anthony.json` in personal-assistant defines `globalTags` with `Project=personal-assistant` and `Environment=prod`; its `infra/lib/app.ts` applies those tags to the app and defaults `System=shared`. Ghostline mirrors that shape with `Project=ghostline` and endpoint `System=xray`, while reserving `System` from global overrides. Explicit EC2 volume tag propagation covers the root disk. See [architecture](architecture.md#resource-lifetime-and-cost-allocation) for the consolidated reporting contract. No reference-repository files were changed.

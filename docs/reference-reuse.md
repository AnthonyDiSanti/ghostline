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

Ghostline uses one stdlib Python runner for recursive shell/Python/Dockerfile discovery. ShellCheck and Hadolint Docker fallbacks are digest-pinned and mount only selected source copies read-only, with networking disabled. All severities fail. Python syntax targets AL2023’s grammar. Tests execute real fixtures with synthetic credentials and verify failure propagation and cleanup. [Development](development.md#asset-verification) owns the current commands and prerequisites.

## Extraction boundary

No common networking library is justified: the reference’s ECS/ALB/NAT topology is not a second consumer of this gateway. A secret-import utility, test-phase runner or small Lambda/custom-resource helper could become shared only when both projects need it. Keep product-specific catalogs, IAM assumptions, retention settings and OpenClaw operations out of a generic component.

Reference notes can be stale: some mention Jest or `.mjs` while live files use Vitest and `.ts`. Bin-link/sandbox repair scripts address specific observed failures and should not become automatic Ghostline installation hooks. Current image release policy belongs in [images](images.md), not inherited reference pinning guidance.

# Reference repository retrieval

Source: read-only review of `../personal-assistant` on 2026-09-07, commit `3517fa6` plus its existing dirty working tree. Consult before copying infrastructure/tooling or interpreting its old notes.

- Stable review and source map: [docs/reference-reuse.md](../../docs/reference-reuse.md).
- The reference uses `context/`, not `.context/`, and has no root README; start at `AGENTS.md` and `docs/README.md` (stored as `docs/readme.md` on this checkout).
- The source repository had pre-existing modifications during review. It was not edited or tested; do not characterize it as a verified clean release.
- `context/knowledge/infra-ops.md` includes an old Jest label; current `infra/package.json` and `vitest.config.ts` use Vitest. Command docs contain some stale `.mjs` paths; inspect actual `.ts` files before invoking anything.
- Prefer the argument-boundary, explicit configuration, and CDK assertion lessons; Ghostline’s own stable-release policy controls image updates. Do not import OpenClaw/Signal/Asana operations, backup/notification requirements, or account identifiers into Ghostline.
- The bin-link repair and sandbox environment script address observed local failures in the reference. Do not source/copy them automatically or replicate credential-cache handling without a present need.
- No shared package or cross-repo build dependency exists. Copy/adapt only a bounded piece with a current Ghostline consumer and its relevant tests.

- Cost-tag reuse: personal-assistant `infra/deployments/profiles/anthony.json` and `infra/lib/app.ts` provide `globalTags` with exact `Project`/`Environment` dimensions and default `System=shared`. Ghostline uses shared task/host resources and protocol-owned repository/EIP roles; see architecture cost allocation.

- Fixture review, 2026-09-15: same commit/dirty working tree, read-only. Consult `infra/scripts/lint-container-assets.ts` for recursive discovery/native lint/Docker fallback, and `infra/test/scripts/{openclaw-gateway-entrypoint,openclaw-admin-helpers,workspace-git-smoke}.test.ts` for actual-script tests using disposable files and substituted external commands. Ghostline adopts ShellCheck + Hadolint with pinned, source-only Docker staging and all-severity failure; it does not import the product-specific harness or floating tool images. Commands and exact adaptations live in [reference reuse](../../docs/reference-reuse.md#fixture-validation).

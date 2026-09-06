# Development and verification

Read before scaffolding or changing code. This is the selected development direction; the repository currently contains documents only. See [reference reuse](reference-reuse.md) for source-code locations and adaptation rationale.

## Intended code layout

Create one npm package under `infra/`, following the reference repository's familiar entrypoint. Avoid a monorepo tool or shared package until there is an actual second consumer.

| Planned path | Responsibility |
| --- | --- |
| `infra/package.json`, `package-lock.json` | Local toolchain, lockfile, npm command surface |
| `infra/cdk.json`, `tsconfig.json`, `vitest.config.ts` | CDK invocation, TypeScript settings, test setup |
| `infra/bin/ghostline.ts` | Thin CLI entrypoint |
| `infra/lib/app.ts` | Testable app builder receiving explicit configuration |
| `infra/lib/endpoint-stack.ts` | First endpoint's AWS resource wiring |
| `infra/lib/config.ts` | Small nonsecret configuration contract and validation |
| `infra/test/` | Focused configuration and synthesized-resource assertions |
| `infra/scripts/` | Only launch/verification helpers that earn their existence |

Create `ops/` or a runtime/container directory when there are actual assets to own. Do not create empty framework layers or a custom Amnezia replacement during scaffolding.

## TypeScript and npm

Use TypeScript with ESM/NodeNext, strict type checking, and direct TypeScript execution through `tsx`, following the reference project. Configure `noEmit` consistently for both ordinary checks and watch mode so source directories do not acquire generated JavaScript/declarations. [TypeScript noEmit](https://www.typescriptlang.org/tsconfig/noEmit.html).

Choose a supported Node/toolchain combination when scaffolding; the reference project's installed versions are evidence of its setup, not a mandate to copy old pins. Record the supported Node version, use a committed npm lockfile, and make dependency updates deliberate. Keep CDK CLI/library versions compatible and feature flags explicit. Do not copy the reference's complete flag list without reviewing its relevance.

Resolve environment inputs at the CLI/configuration boundary and pass typed values to stacks. Keep test configuration independent of a developer's AWS identity. Prefer small ordinary CDK resources; introduce a construct when it encapsulates a meaningful repeated pattern.

For subprocesses, use explicit argument arrays or execa tagged templates that preserve argument boundaries. Keep substantial shell snippets in script/fixture files. Prefer an AWS SDK call over a secret value embedded in process command-line arguments when implementing secret-writing automation.

## Intended command contract

These commands do not exist yet. Add them with the implementation and update this table to describe actual behavior.

| Command from `infra/` | Intended behavior |
| --- | --- |
| `npm ci` | Install from the committed lockfile after initial scaffolding |
| `npm run build` | Typecheck without emitting source artifacts |
| `npm run watch` | Typecheck continuously without emitting source artifacts |
| `npm run test:vitest -- <path>` | Run focused tests using Vitest |
| `npm run test:cdk` | Synthesize with explicit dummy inputs and no AWS calls |
| `npm test` | Full local gate: typecheck, synth, and unit/infrastructure assertions |
| `npm run synth` | Synthesize the intended deployment configuration; no implicit secret reads |
| `npm run diff` | Preview the selected stack's AWS changes |
| `npm run deploy` | Apply the reviewed deployment when launch is authorized |

Start with straightforward npm composition. Do not copy the large parallel phase runner, synth-cache locking, plugin suites, container lints, or image workflows before Ghostline needs them. Add container checks when we own container assets.

## Verification principles

Use Vitest and `aws-cdk-lib/assertions` for important properties and regressions, rather than entire-template snapshots or assertions that merely restate every assignment. [Vitest guide](https://vitest.dev/guide/), [AWS CDK testing](https://docs.aws.amazon.com/cdk/v2/guide/testing.html).

The first stack's meaningful checks should cover the intended small resource shape, EIP-to-instance wiring, necessary listener/operator ingress, absence of unrequested NAT/load-balancer/HA infrastructure, and no embedded secret values. Tests and CLI should use the same app builder and CDK context flags. Prefer fresh synthesis for this small stack; add caching only if measured test cost justifies it.

Run focused tests first, then the full local gate. AWS synth/tests do not establish macOS/iOS behavior or real UAE reachability; the owner-operated connection experiment supplies that evidence. Keep live cloud actions out of the default test command. Run a fresh diff before deployment for the actual tree/configuration.

For documentation-only changes, inspect changed links and scope consistency across the full document set. No application test suite exists until scaffolding creates one.

## First implementation sequence

1. Scaffold the small TypeScript/CDK/npm project and offline verification, adapting the reviewed patterns.
2. Implement one endpoint stack and select installer-compatible host inputs. Obtain the AWS CLI profile/account and operator access inputs as part of launch preparation.
3. Review a concrete CDK diff and launch when requested. Let Amnezia install/configure the chosen protocol.
4. Record only necessary launch actions, nonsecret settings/versions, and references to saved recovery material. Use LastPass/Parameter Store according to the [architecture boundary](architecture.md).
5. Try macOS and iOS under the actual filtering conditions. Record practical results, IPv6 behavior, and any necessary follow-up.
6. Decide from the experiment whether to adjust the setup, stop, try an alternative, or specify our own deterministic runtime.

No prewritten runbook, installer audit, recovery drill, shared library, or second endpoint blocks this sequence.

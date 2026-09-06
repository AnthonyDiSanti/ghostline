# Development and verification

Read before changing infrastructure code or deploying. The executable package lives under `infra/`. See [reference reuse](reference-reuse.md) for source-code locations and adaptation rationale.

## Code layout

Use the single npm package under `infra/`, following the reference repository's familiar entrypoint. Avoid a monorepo tool or shared package until there is an actual second consumer.

| Path | Responsibility |
| --- | --- |
| `infra/package.json`, `package-lock.json` | Local toolchain, lockfile, npm command surface |
| `infra/cdk.json`, `tsconfig.json`, `vitest.config.ts` | CDK invocation, TypeScript settings, test setup |
| `infra/bin/ghostline.ts` | Thin CLI entrypoint |
| `infra/lib/app.ts` | Testable app builder receiving explicit configuration |
| `infra/lib/endpoint-stack.ts` | Single endpoint's AWS resource wiring |
| `infra/lib/config.ts` | Small nonsecret configuration contract and validation |
| `infra/test/` | Focused configuration and synthesized-resource assertions |
| `infra/scripts/` | Only launch/verification helpers that earn their existence |

Create `ops/` or a runtime/container directory when there are actual assets to own. Do not create empty framework layers or a custom Amnezia replacement during scaffolding.

## TypeScript and npm

Use TypeScript with ESM/NodeNext, strict type checking, and direct TypeScript execution through `tsx`, following the reference project. Configure `noEmit` consistently for both ordinary checks and watch mode so source directories do not acquire generated JavaScript/declarations. [TypeScript noEmit](https://www.typescriptlang.org/tsconfig/noEmit.html).

Use Node 24 LTS (`infra/.node-version`) and the committed npm lockfile. The implementation was verified on Node 24.20.0; dependencies have exact direct pins. Make dependency updates deliberate. Keep CDK CLI/library versions compatible and feature flags explicit. Do not copy the reference's complete flag list without reviewing its relevance.

Resolve environment inputs at the CLI/configuration boundary and pass typed values to stacks. Keep test configuration independent of a developer's AWS identity. Prefer small ordinary CDK resources; introduce a construct when it encapsulates a meaningful repeated pattern.

For subprocesses, use explicit argument arrays or execa tagged templates that preserve argument boundaries. Keep substantial shell snippets in script/fixture files. Prefer an AWS SDK call over a secret value embedded in process command-line arguments when implementing secret-writing automation.

## Command contract

Run these commands from `infra/` with Node 24 selected. Tests require no AWS credentials or live resources.

| Command from `infra/` | Behavior |
| --- | --- |
| `npm ci` | Install from the committed lockfile  |
| `npm run build` | Typecheck without emitting source artifacts |
| `npm run watch` | Typecheck continuously without emitting source artifacts |
| `npm run test:vitest -- <path>` | Run focused tests using Vitest |
| `npm run test:cdk` | Synthesize with explicit dummy inputs and no AWS calls |
| `npm test` | Full local gate: typecheck, synth, and unit/infrastructure assertions |
| `npm run synth` | Synthesize the intended deployment configuration; no implicit secret reads |
| `npm run diff` | Preview the selected stack's AWS changes |
| `npm run deploy` | Apply the reviewed deployment when launch is authorized |

Start with straightforward npm composition. Do not copy the large parallel phase runner, synth-cache locking, plugin suites, container lints, or image workflows before Ghostline needs them. Add container checks when we own container assets.

## Deployment inputs

`deployment.json` contains nonsecret account, region, AZ, AMI, sizing and global cost tags. The CLI uses AWS profile `personal`. The app builder takes explicit inputs, including dummy account/key material in offline tests. Two environment variables are required only for live synth/diff/deploy:

```sh
# From infra/, with the already-generated dedicated public key on this machine.
export GHOSTLINE_SSH_CIDR=5.195.76.221/32
export GHOSTLINE_SSH_PUBLIC_KEY_PATH="$PWD/../.local/keys/ghostline-poc.pub"
npm run synth
npm run diff
npm run deploy
```

Update the `/32` to the operator's actual IPv4 after changing networks, review the diff, and redeploy. Do not widen SSH access or replace the dedicated key on routine updates. Restore it from the designated encrypted store when using a new machine. Pass only the public key to CDK; the private key is for SSH/Amnezia. Deploy writes identifiers to ignored `.local/outputs.json`.

The asset-free stack uses CDK's built-in `LegacyStackSynthesizer` with current CLI credentials and an inline CloudFormation template. No bootstrap roles/bucket/repository are required. Offline synthesis verifies that no deployment role, bootstrap requirement, or file asset has crept in, and that the template remains below the inline size limit. Reconsider the synthesizer when adding managed runtime assets; do not add a custom compatibility layer.

The pinned AMI/AZ are intentional for this one-region experiment. CDK's portability warnings are expected and do not establish image availability; verify the AMI before a future host replacement. L1 EC2 resources keep incidental IAM/custom resources out of the topology. See [architecture](architecture.md) for resource lifetime and billing tags.

## Verification principles

Use Vitest and `aws-cdk-lib/assertions` for important properties and regressions, rather than entire-template snapshots or assertions that merely restate every assignment. [Vitest guide](https://vitest.dev/guide/), [AWS CDK testing](https://docs.aws.amazon.com/cdk/v2/guide/testing.html).

The stack's assertions cover the intended small resource shape, EIP-to-instance wiring, necessary listener/operator ingress, absence of unrequested NAT/load-balancer/HA infrastructure, and no embedded secret values. Tests and CLI should use the same app builder and CDK context flags. Prefer fresh synthesis for this small stack; add caching only if measured test cost justifies it.

Run focused tests first, then the full local gate. AWS synth/tests do not establish macOS/iOS behavior or real UAE reachability; the owner-operated connection experiment supplies that evidence. Keep live cloud actions out of the default test command. Run a fresh diff before deployment for the actual tree/configuration.

For documentation-only changes, inspect changed links and scope consistency across the full document set.

## Release sequence

1. Implement and verify the TypeScript/CDK/npm package — complete.
2. Select installer-compatible inputs and implement one endpoint stack — complete.
3. Review a fresh CDK diff and deploy — complete. Install XRay through Amnezia — complete.
4. Record only necessary launch actions, nonsecret settings/versions, and references to saved recovery material. Use LastPass/Parameter Store according to the [architecture boundary](architecture.md).
5. Configure all intended client features and both device profiles before testing the complete setup. Then debug observed failures under the actual filtering conditions; record practical results and IPv6 behavior.
   - Current evidence: native macOS tunnel/reconnect and owner-reported macOS/iOS practical tests pass; destination privacy, concurrent use and video remain unresolved. See [launch](launch.md).
6. Decide from the experiment whether to adjust the setup, stop, try an alternative, or specify our own deterministic runtime.

No prewritten runbook, installer audit, recovery drill, shared library, or second endpoint blocks this sequence.

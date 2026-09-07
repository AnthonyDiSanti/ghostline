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
| `infra/deployment.json`, `infra/lib/config.ts` | Named regional targets, shared defaults and validation |
| `infra/lib/commands.ts`, `infra/scripts/deployment.ts` | Explicit target selection, isolated artifacts and live preflight |
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
| `npm run test:vitest <path>` | Run focused tests using Vitest |
| `npm run test:cdk` | Synthesize with explicit dummy inputs and no AWS calls |
| `npm test` | Full local gate: typecheck, synth, and unit/infrastructure assertions |
| `npm run deployments` | List committed deployment targets without AWS calls |
| `npm run preflight <target>` | Check account, region enablement, AMI, AZ and instance offering |
| `npm run synth <target>` | Synthesize the intended deployment configuration; no implicit secret reads |
| `npm run diff <target>` | Preview the selected stack's AWS changes |
| `npm run deploy <target>` | Apply the reviewed deployment when launch is authorized |

Start with straightforward npm composition. Do not copy the large parallel phase runner, synth-cache locking, plugin suites, container lints, or image workflows before Ghostline needs them. Add container checks when we own container assets.

## Deployment inputs

`deployment.json` contains shared account/sizing/cost dimensions and named targets. Each target owns region, AZ, pinned AMI, stack name and resource/key name. `frankfurt` retains the original deployment recipe; `cape-town` is the live regional stack. The catalog lists available configurations, not live AWS inventory; consult the launch records for lifecycle state. The same stack name in different regions identifies different CloudFormation stacks. Adding a second environment in one region would require distinct stack and resource names.

The target is a positional npm-script argument, so use `npm run deploy cape-town`. The `--` separator is only needed when forwarding options that npm might otherwise interpret (for example `npm run test:vitest -- --reporter=verbose`); our deployment helper accepts only the target.

Commands require an explicit target; none deploy every entry or infer a target from the AWS profile's default region. The CLI uses profile `personal`. The app builder takes explicit inputs, including dummy identity/key material in tests. Two environment variables supply live operator inputs:

```sh
# From infra/, after creating/restoring this target's dedicated RSA public/private key pair.
export GHOSTLINE_SSH_CIDR=5.195.76.221/32
export GHOSTLINE_SSH_PUBLIC_KEY_PATH="$PWD/../.local/keys/ghostline-poc-cape-town.pub"
npm run preflight cape-town
npm run synth cape-town
npm run diff cape-town
npm run deploy cape-town
```

Frankfurt teardown is complete; do not redeploy it without a new request. Its saved recipe uses target `frankfurt` and public key `ghostline-poc.pub`. Update the `/32` to the operator's actual IPv4 after changing networks; disconnect the tunnel to determine that address and perform SSH administration. Do not widen SSH or replace keys on routine updates. Pass only public keys to CDK. Keep private keys in ignored `.local/keys/` and the designated encrypted store.

Each target writes synthesis and outputs under ignored `.local/deployments/<target>/`; deploying Cape Town cannot overwrite Frankfurt artifacts. Historical `.local/outputs.json` remains the original launch record. `SshCommand` assumes the matching private key is stored at `.local/keys/<resourceName>` from the repository root. Local recovery exports also need distinct target names.

Diff and deploy automatically run the read-only preflight. It checks the AWS account, region opt-in, official Canonical Ubuntu 24.04 image metadata, AZ and instance offering. It does not guarantee spare capacity, quotas or client reachability. Synthesis and `npm test` remain offline. Direct `npm run cdk -- ...` is an expert escape hatch; set `GHOSTLINE_DEPLOYMENT` explicitly and prefer the scoped commands for ordinary use.

Cape Town is an opt-in region. Anthony enabled it on 2026-09-07; monitoring observed `ENABLING`, then `ENABLED`, followed by a successful regional preflight. For a new opt-in region, enable it explicitly, then monitor:

```sh
aws --profile personal account get-region-opt-status --region-name af-south-1 --region us-east-1
```

Wait for `ENABLED` and a passing preflight. Do not hide account enablement inside deployment or change IAM controls to work around propagation. AWS notes that propagation may take minutes to hours. [AWS region enablement](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html).

The asset-free stack uses CDK's built-in `LegacyStackSynthesizer` with current CLI credentials and an inline CloudFormation template. No bootstrap roles/bucket/repository are required. Offline synthesis verifies that no deployment role, bootstrap requirement, or file asset has crept in, and that the template remains below the inline size limit. Reconsider the synthesizer when adding managed runtime assets; do not add a custom compatibility layer.

Each target pins its own AMI/AZ. Both initial targets use Canonical Ubuntu 24.04 server build `20260904`, with distinct regional AMI IDs. CDK portability warnings are expected; preflight verifies availability without silently upgrading an existing host. Resolve future image pins using [Canonical image discovery](https://documentation.ubuntu.com/aws/en/latest/aws-how-to/instances/find-ubuntu-images/) and verify them through AWS before deployment. L1 EC2 resources keep incidental IAM/custom resources out of the topology. See [architecture](architecture.md) for resource lifetime and billing tags.

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
   - Current evidence: owner-reported macOS/iOS practical tests pass for both exits; native Mac switching also passes. Individual privacy, concurrency, video and IPv6 subtests were not separately enumerated. See [Frankfurt](launch.md) and [Cape Town](launch-cape-town.md) evidence. LastPass saves remain unconfirmed.
6. Decide from the experiment whether to adjust the setup, stop, try an alternative, or specify our own deterministic runtime.

Cape Town repeated the same stack workflow and Amnezia Manual → XRay installation with fresh runtime identity while preserving Frankfurt. Use that workflow for future authorized targets. IaC recreates the host, not its installer-managed runtime. No fleet controller, automatic failover, scheduled shutdown or automated recovery is part of this work.

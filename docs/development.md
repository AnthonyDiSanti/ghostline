# Development

Use Node 24 and the single strict TypeScript package under `infra/`. Select a named deployment explicitly; never infer a target from the ambient AWS region. `AGENTS.local.md`, when present, contains machine-only execution overrides.

## Code map

| Location | Responsibility |
| --- | --- |
| `infra/bin/ghostline.ts`, `infra/lib/app.ts` | Thin CDK entrypoint and shared testable gateway builder |
| `infra/deployment.json`, `infra/lib/config.ts` | Maintained regional catalog and strict configuration validation |
| `infra/lib/ecs-stack.ts` | Reusable endpoint and durable image stacks |
| `infra/lib/ecs-memory.ts`, `infra/lib/deployment-ami.ts` | Memory budget and AWS host-image checks |
| `infra/lib/ecs-release.ts`, `infra/lib/ecs-images.ts` | Three ARM64 image artifacts, content identities and publication |
| `infra/lib/parameters.ts`, `infra/lib/xray-config.ts` | Portable credential validation and regional SecureString import |
| `infra/lib/ecs-power.ts`, `infra/lib/lifecycle.ts` | Scoped start/stop, deletion and retained-address release |
| `infra/lib/ecs-user-data.ts`, `runtime/ecs/` | Host fixtures, shared initializer, engine startup and bridge policy |
| `infra/lib/ecs-client-test.ts`, `infra/lib/ecs-verification.ts` | Real client probes and redacted SSM verification |
| `infra/lib/fixtures.ts`, `infra/test/fixtures/` | Explicit fixture rendering and standalone test programs |

## TypeScript and npm

From `infra/`, run `npm ci` then `npm test`. Typecheck without emitting files; keep cloud operations outside tests. Use explicit subprocess argument arrays. Never put secret values in command-line arguments, templates, user data, image build contexts or logs.

Shell/Python program bodies live in `.sh`/`.py` files under `runtime/` or `infra/test/fixtures/`, including nested programs. Systemd units live under `runtime/ecs/systemd/`. `renderFixture()` replaces exact `@@NAME@@` slots once and rejects missing/unused inputs; it does not perform shell escaping or recursive expansion. Validate identifiers and encode transported files before rendering.

`ecsUserData()` assembles nonsecret host fixtures. Changes to those fixtures need a retained-IP cold rebuild because cloud-init does not replay them on ordinary reboot. Verification separately transports `verify.py` and `network-probe.py` through `verify.sh`, cleaning its temporary code directory on exit.

## Commands

| Command | Result |
| --- | --- |
| `npm run build` / `npm run watch` | Typecheck once / continuously |
| `npm run test:vitest <path>` | Focused Vitest checks |
| `npm run test:assets` | Shell/Python syntax, ShellCheck and Hadolint |
| `npm run lint:shell` / `npm run lint:docker` | Focused asset linting |
| `npm run test:cdk` | Fresh offline synthesis of the maintained catalog |
| `npm test` | Full local gate: typecheck, asset checks, synth and Vitest |
| `npm run test:ecs-images` | Build/test the three ARM64 artifacts with disposable synthetic credentials |
| `npm run deployments` | List maintained targets; allocate nothing |
| `npm run preflight <target>` | Verify AWS account, enabled region, AWS AL2023 ARM64 AMI, AZ, instance capacity/offering |
| `npm run synth <target>` / `npm run diff <target>` | Synthesize / compare the selected endpoint |
| `npm run ecs <target> import <directory>` | Import six validated protected credential files; refuse conflicting values |
| `npm run ecs <target> publish` | Diff/create durable ECR repositories and publish missing immutable releases |
| `npm run ecs <target> deploy` | Preflight, check server parameters/images, diff and deploy the gateway |
| `npm run ecs <target> start` / `stop` | Start/stop the selected host and service in lifecycle order |
| `npm run ecs <target> status` | Read selected stack outputs and EC2 state |
| `npm run ecs <target> verify` | Check live configuration hashes, security, memory, native architecture and EIP egress |
| `npm run ecs <target> profiles` | Write protected client profiles/links/QRs with current addresses |
| `npm run ecs <target> test` | Test real encrypted HTTPS through both protocols using disposable local clients |
| `npm run park <target>` | Remove endpoint compute/disk/networking while retaining its two tracked EIPs |
| `npm run destroy <target>` | Remove the endpoint and explicitly release its two owned EIPs |

The primary target is `stockholm-ecs`; the backup target is `cape-town`. Npm accepts these positional arguments without `--`; the delimiter is only useful when forwarding options such as `npm run test:assets -- --docker`. AWS commands use profile `personal`. CDK receives `GHOSTLINE_DEPLOYMENT` from the wrapper; only explicit `active`/`parked` lifecycle modes are supported. No SSH key or operator CIDR input exists.

Use `ecs deploy` for a normal active rollout; low-level `npm run deploy` remains the direct CDK entrypoint used by the lifecycle wrapper. Image publication precedes deployment. Never use `--all`, deploy a retired catalog recipe, or run an unreviewed change against a live exit.

## Asset verification

`infra/scripts/check-assets.py` recursively discovers maintained shell, Python and Dockerfile files under `runtime/`, `infra/scripts/` and `infra/test/fixtures/`, including new untracked files. It rejects missing roots/empty categories and skips symlinks. Shell parsing follows the shebang; Python parsing uses AL2023's Python 3.9 grammar without execution or bytecode output.

Use native Bash/Python and `brew install shellcheck hadolint`, or Docker for missing linters. Docker fallbacks are version/digest-pinned ShellCheck 0.11.0 and Hadolint 2.14.0; `npm run test:assets -- --docker` forces them. Only disposable copies of exact source inputs are mounted read-only, with networking disabled at runtime. The repository and recovery files are never mounted into linters.

All diagnostic severities fail. ShellCheck ignores home configuration; Hadolint uses `infra/hadolint.yaml`; inherited lint exclusions are removed. Fix findings or document a narrow exception beside the relevant instruction. Use real fixtures with synthetic inputs and replace only external command boundaries in tests. Do not recreate EC2/systemd in a mock framework.

Offline synthesis currently covers **two named regional configurations, each with an endpoint stack and an image stack**, not the number of container images. Independent synthetic-region tests verify stack reuse without making abandoned regions deployable. Static checks do not establish connectivity. Disconnect a native VPN before disposable tunnel probes so nesting does not distort direct-path results.

## On-demand regional lifecycle

Read [lifecycle](deployment-lifecycle.md) and the selected launch record before changes. Stop keeps the host/disk/IPs; park removes host/disk/networking but retains tracked IPs; destroy also releases them. Durable images and regional parameters survive both park and destroy. New allocations require fresh client endpoint exports.

The destroy helper records exact CloudFormation ownership in ignored `.local/deployments/<target>/pending-release.json`, waits for deletion, rechecks tags/attachment and releases only captured allocations. Retry resumes that exact stack ARN; completion renames the record to `last-release.json`. Do not bypass ownership refusals or release unrelated addresses.

For a host AMI or bootstrap change, publish required images, park, deploy, then run `verify` and `test`. The existing ENI cannot be attached to a replacement host while the first host still owns it. This cold rebuild has an outage; an unchanged-image task deployment does not require rebuilding the host.

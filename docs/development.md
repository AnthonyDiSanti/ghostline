# Development

Use Node 24 and the strict TypeScript package under `infra/`, including its reusable notifications package. Install native `jq`: Xray verification and image tests run the same checked-in logging-policy filter as the initializer, with input/output captured and parser details withheld. Select a named deployment explicitly; never infer a target from the ambient AWS region. `AGENTS.local.md`, when present, contains machine-only execution overrides.

## Code map

| Location | Responsibility |
| --- | --- |
| `infra/bin/ghostline.ts`, `infra/lib/app.ts` | Thin CDK entrypoint and shared testable gateway builder |
| `infra/deployment.json`, `infra/lib/config.ts` | Maintained regional catalog and strict configuration validation |
| `infra/lib/ecs-stack.ts` | Reusable disposable endpoint stack |
| `infra/lib/releases/`, `infra/lambda/release-gate.ts`, `infra/scripts/release.ts` | Global publication, regional image infrastructure and static-task deployment gate |
| `infra/packages/notifications/` | Independent SNS event/alarm routing and private-parameter email subscription |
| `infra/lib/ecs-memory.ts`, `infra/lib/bottlerocket-os.ts` | Memory budget and AWS host-image checks |
| `infra/lib/ecs-release.ts`, `infra/lib/ecs-images.ts` | Seven ARM64 image artifacts, content identities and publication |
| `infra/lib/derp-*.ts`, `infra/scripts/derp.ts` | DERP identity provisioning, local/public protocol proofs and image checks |
| `infra/lib/releases/trial-exclusions.ts`, `infra/scripts/trial.ts` | Shared regional admission, independent native candidates and captured baseline return |
| `infra/lib/stable-images.ts`, `infra/lib/upstream-download.ts`, `infra/image-inputs.json` | Stable resolution, scoped authenticated metadata reads and recorded verified build inputs |
| `infra/lib/region-initialization*.ts`, `infra/scripts/init-region.ts` | Reviewed fresh-region identity/contact initialization and recoverable private staging |
| `infra/lib/logged-nodejs-function.ts` | Local Node.js Lambda/log-group construction with explicit caller policy |
| `infra/lib/parameters.ts`, `infra/lib/xray-config.ts` | Portable credential validation and regional SecureString import |
| `infra/lib/ecs-power.ts`, `infra/lib/lifecycle.ts` | Scoped start/stop, deletion and retained-address release |
| `infra/lib/guardduty-discovery.ts`, `infra/lib/guardduty.ts` | Live regional availability, enable-only reconciliation and bounded coverage verification |
| `infra/lib/gateway-platform.ts`, `runtime/ecs/` | Host fixtures, shared initializer, engine startup and bridge policy |
| `infra/lib/ecs-client-test.ts`, `infra/lib/ecs-verification.ts` | Real client probes and redacted SSM verification |
| `infra/lib/fixtures.ts`, `infra/test/fixtures/` | Explicit fixture rendering and standalone test programs |

## TypeScript and npm

From `infra/`, run `npm ci` then `npm test`. Typecheck without emitting files; keep cloud operations outside tests. Use explicit subprocess argument arrays. Never put secret values in command-line arguments, templates, user data, image build contexts or logs.

Shell/Python program bodies live in `.sh`/`.py` files under `runtime/` or `infra/test/fixtures/`, including nested programs. Bottlerocket TOML settings live beside the platform fixtures. `renderFixture()` replaces exact `@@NAME@@` slots once and rejects missing/unused inputs; it does not perform shell escaping or recursive expansion. Validate identifiers and encode transported files before rendering.

`gatewayPlatform()` renders nonsecret Bottlerocket settings. The common seven-image pipeline publishes distinct bootstrap/diagnostic and restricted daemon artifacts alongside private DNS and DERP/STUN. Every meaningful component, host-template or qualified OS change prepares a temporary green host through the same native ECS/EIP rollout; unchanged releases remain no-ops. [Platform workflow](platform.md).

## Commands

| Command | Result |
| --- | --- |
| `npm run build` / `npm run watch` | Typecheck once / continuously |
| `npm run test:vitest <path>` | Focused Vitest checks |
| `npm run test:assets` | Shell/Python syntax, ShellCheck and Hadolint |
| `npm run lint:shell` / `npm run lint:docker` | Focused asset linting |
| `npm run test:cdk` | Fresh offline synthesis of the maintained catalog |
| `npm test` | Full local gate: typecheck, asset checks, synth and Vitest |
| `npm run images:build` | Resolve stable engines, CoreDNS and DERP; build/test the seven-image release locally before recording inputs |
| `npm run images:build -- coredns` | Refresh only CoreDNS while reusing recorded engines/DERP; run the full gate |
| `npm run images:build -- --derp` | Refresh only DERP and run its focused local proof; still require whole-set qualification before publication |
| `npm run test:ecs-images` | Check seven ARM64 artifacts, platform boundaries, real encrypted tunnels and DERP/STUN with synthetic credentials |
| `npm run derp <target> provision` / `status` | Explicit no-overwrite DERP identity import/public pin status against the retained AWG IP |
| `npm run derp <target> test -- --via <maintained-target>` | Probe pinned public relay/STUN through an admitted, different AWS AWG endpoint |
| `npm run trial <target> stage <qualified.json>` / `begin [digest]` / `deploy` / `return` / `status` / `finish` | Test immutable native candidates or the production canary with regional exclusion; candidates restore the captured baseline/mode |
| `npm run test:ram-runtime -- --output /absolute/path/to/count-only.json` | Explicit local Option A integration proof: synthetic secrets, Docker/containerd RAM stores, restart and persistence controls; requires pinned fixture images and privileged ARM64 Docker nesting |
| `npm run platform <target> status` | Observe actual boot, OS and component identities |
| `npm run platform <target> qualify <qualified-file>` | Close central native qualification after the documented experiment; verify runtime and record exact platform/OS compatibility |
| `npm run deployments` | List maintained targets; allocate nothing |
| `npm run preflight <target>` | Verify AWS account, enabled region, official regional AMI for the centrally qualified target OS, AZ, instance capacity/offering |
| `npm run synth <target>` / `npm run diff <target>` | Discover live GuardDuty availability and synthesize / compare the selected endpoint |
| `npm run init-region -- <target> plan --alerts-from <existing-target>` | Inventory metadata and write a private review plan; generate/decrypt nothing |
| `npm run init-region -- <target> execute <reviewed-plan-file>` | Recheck state, initialize independent credentials/contact and verify without overwrite |
| `npm run ecs <target> import <directory>` | Import six validated protected credential files; refuse conflicting values |
| `npm run release publish <target-or-region>` | Publish centrally qualified bytes once; native replication and regional gates handle rollout |
| `npm run release status [target]` / `reconcile <target>` / `retry <target>` | Inspect, reconcile or explicitly retry a release |
| `npm run release mode <target> <active\|manual\|held>` | Set regional release selection mode; manual continues only a CLI-handed-off rollout, pending native qualification |
| `npm run release cleanup-failed <target>` | Remove held green only after verified rollback or explicit stopped-blue proof |
| `npm run release activate <target>` | Prepare/seed a member before enabling outbound replication and automation |
| `npm run ecs <target> deploy` / `unpark` | Check parameter metadata/images/live support, diff/deploy gateway, enable available protection and verify its reported coverage |
| `npm run ecs <target> start` / `stop` | Start/stop the selected host and service in lifecycle order |
| `npm run ecs <target> status` | Read selected stack outputs and EC2 state |
| `npm run ecs <target> verify` | Check live configuration hashes, security, memory, architecture, EIP egress and GuardDuty coverage |
| `npm run ecs <target> profiles` | Write protected client profiles/links/QRs with current addresses |
| `npm run ecs <target> test` | Test real encrypted HTTPS through both protocols using disposable local clients |
| `npm run park <target>` | Remove endpoint compute/disk/networking while retaining its two tracked EIPs |
| `npm run destroy <target>` | Remove owned endpoint and regional release/runtime support, local images and EIPs; retain deliberate security/credential/expiring-log classes |
| `npm run purge-region <region> plan` / `execute` | After destroy, review then delete owned residual parameters, log groups, queues and ECS task definitions across that region; preserve GuardDuty, shared CloudTrail and local files |

The primary target is `oregon`; `stockholm-ecs` and `zurich` are active for testing; `cape-town` is the parked backup. Npm accepts these positional arguments without `--`; the delimiter is only useful when forwarding options such as `npm run test:assets -- --docker`. AWS commands use profile `personal`. CDK receives `GHOSTLINE_DEPLOYMENT` from the wrapper; only explicit `active`/`parked` lifecycle modes are supported. No SSH key or operator CIDR input exists.

Maintained engine/device credentials and DERP identities use `/ghostline/prod`; the secret inventory includes their exact paths and the separate release-alert contact. An isolated private catalog may set a validated `parameterPrefix` under `/ghostline/trial/<name>`; the common endpoint task/IAM, metadata preflight, import, verification and profile export all use that same namespace. This keeps a disposable region's enrolled device identities separate while exercising the normal `park`/`ecs unpark` lifecycle. It does not add a maintained regional target. [Credential boundary](secrets.md), [Ireland evidence](../.context/scratch/2026-10-19-tor-retirement/tor-dns-trial.md#managed-ireland-trial--october-13-2026).

Use `images:build` for a new whole-set stable selection with `gh` authenticated to `github.com`. Review recorded inputs; publication/deployment reuse them without rediscovery. [Image workflow and evidence limits](images.md). `ecs deploy` uses the common native rollout and enable-only [GuardDuty reconciliation](guardduty.md); confirmed service gaps are reported, while access/installation failures remain errors. `npm run deploy` delegates to the same lifecycle. Never use `--all`, deploy a retired recipe or run an unreviewed live change. Active trial exclusions defer conflicting regional mutations with status 3; finish a verified trial before power operations. [Trial boundary](candidate-releases.md#operational-boundary).

## Explicit regional initialization

Use `init-region` before ordinary release activation/preflight/deployment for an explicitly approved fresh target. `plan` checks the account, enabled region, endpoint/host presence and exact parameter metadata; it records the proposed source contact version without decrypting values. An existing complete credential set is preserved; an unexplained partial set refuses initialization. It does not opt in regions, purge old identities or modify image publication/security controls.

Review the generated `.local/region-init/<target>/<plan-id>.json`, then execute that exact file. Forward `--alerts-from` through npm with the `--` delimiter. Copying an existing private contact requires authorization for that destination. The execution stages one matching set under a private operation directory and uses the common no-overwrite importer. A retry uses that same set and checks existing values before writing missing parameters. Never delete staging or regenerate identities to force a retry: missing staging during incomplete import requires explicit recovery. Completed imports remove temporary credential staging; Parameter Store remains authoritative. Existing identities preserved by metadata are reported separately from freshly imported byte-equality checks.

The local `execute.lock` serializes writers and is removed after normal completion/failure. After a process crash, inspect its PID and operation receipt before removing an abandoned lock. Plans and receipts contain metadata only; credential staging and exports remain protected files. Deploy never generates identities. Continue with the standard release activation, preflight/diff/deploy, verification and profile-export commands; saved profiles and recipient SNS confirmation require separate acceptance.

## Asset verification

`infra/scripts/check-assets.py` recursively discovers maintained shell, Python and Dockerfile files under `runtime/`, `infra/scripts/` and `infra/test/fixtures/`, including new untracked files. It rejects missing roots/empty categories and skips symlinks. Shell parsing follows the shebang; Python parsing uses the portable Python 3.9 grammar without execution or bytecode output.

Use native Bash/Python and `brew install shellcheck hadolint`, or Docker for missing linters. Docker fallbacks are version/digest-pinned ShellCheck 0.11.0 and Hadolint 2.14.0; `npm run test:assets -- --docker` forces them. Only disposable copies of exact source inputs are mounted read-only, with networking disabled at runtime. The repository and recovery files are never mounted into linters.

All diagnostic severities fail. ShellCheck ignores home configuration; Hadolint uses `infra/hadolint.yaml`; inherited lint exclusions are removed. Fix findings or document a narrow exception beside the relevant instruction. Use real fixtures with synthetic inputs and replace only external command boundaries in tests. Do not recreate EC2/systemd in a mock framework.

Offline synthesis covers **all five maintained regional configurations, each with its disposable endpoint stack; separate assertions synthesize regional release infrastructure**. These offline synths use explicit synthetic GuardDuty support; named CLI synth/diff/deploy commands discover support live. Regional GuardDuty settings are outside the application CloudFormation lifecycle. Stack count is independent of the six runnable images and non-runnable release document. Independent synthetic-region tests verify reuse without making abandoned regions deployable. Static checks do not establish connectivity. Disconnect a native VPN before regional tunnel probes so nesting does not distort direct-path results; the local image suite keeps both protocol peers inside Docker.

## On-demand regional lifecycle

Read [lifecycle](deployment-lifecycle.md) and the selected launch record before changes. Stop keeps the host/disk/IPs; park removes host/disk/networking but retains tracked IPs; destroy also releases them. Park retains images and release support; destroy removes them. Standard regional credentials survive both. New allocations require fresh client endpoint exports.

The destroy helper records exact regional ownership and resumable phases in ignored `.local/deployments/<target>/regional-cleanup.json`. Read [lifecycle](deployment-lifecycle.md#exclusion-and-resumable-destroy) for exclusion, replication retirement, retained resource classes and incomplete-cleanup reporting. Ireland passed complete destroy, repeat-destroy and reseeded redeployment. The final expanded whole-stack cleanup remains in the active work item; see the handoff for its current checkpoint.

For native settings/layout/size or task-definition changes, use the normal coordinated `ecs deploy` command after central qualification. Shared infrastructure and immutable host-slot templates remain CDK-owned. The CLI prepares green before transferring its lock to ECS hooks; it must not deploy a task change first and deadlock waiting for its own hook. Existing root-owned hosts require the explicit retain/import migration before this recipe can be deployed. See the [handoff](../.context/handoff.md) for qualification/migration status.

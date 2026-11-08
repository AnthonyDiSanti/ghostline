# CDK abstraction decision proposals

November 7, 2026. Anthony requested a deeper explanation and individual thumbs-up/down decisions before implementation. Anthony subsequently approved 1 and 3, deferring 2. Proposal 1 is implemented: all 16 template/asset scenarios and six live release-stack plans are identical. Proposal 3 passed its 475-test implementation gate and fresh NVA owner acceptance/retirement. The subsequent maintained NVA launch passes the 476-test gate and both actual native Mac connections; see the [current launch](../../../docs/launch-nva.md). The original rationale below is retained as the decision record.

## 1. Local logged Node.js Lambda factory

Problem: release Gate and DeploymentHook repeat explicit log-group setup, Node.js 24, lockfile configuration and minified bundling with the selected AWS SDK included. Their memory, timeouts, concurrency, retries, IAM and environment differ intentionally. Centralize the shared construction recipe while keeping those operational differences visible.

Proposed first scope: a function in the main infrastructure package, used by those two release functions. Keep the notifications package self-contained; it must not import upward from `infra/lib`. A neutral shared package or sibling-project adoption requires a separate concrete consumer/policy decision. This narrows the earlier suggestion to consolidate the notification handler at the same time.

Implemented call shape:

```ts
const hook = loggedNodejsFunction(this, 'DeploymentHook', {
  log: { id: 'HookLogs', retention: ONE_WEEK, removalPolicy: RETAIN },
  function: {
    functionName: hookName, entry: hookEntry, depsLockFilePath: lock,
    architecture: ARM_64, memorySize: 128,
    timeout: seconds(75), reservedConcurrentExecutions: 4,
    retryAttempts: 0, environment: hookEnvironment,
  },
});
hook.addToRolePolicy(invokeOnlyThisController);
```

The factory owns the existing runtime/bundling recipe and creates the explicit log group at the supplied scope. It returns the ordinary NodejsFunction so callers retain standard CDK grants/metrics/environment APIs. IAM and event/DLQ wiring remain at the call site. Logging retention/removal remain required inputs, not inherited hidden defaults. The benchmark browser Lambda remains outside this factory: it uses prebuilt browser assets and a different architecture/build path. Existing custom-resource provider logging also stays separate.

Benefit: one place to maintain shared Lambda construction policy. Cost: another function/interface for a small amount of current duplication; this is a modest consistency improvement, not a major capability. Reject it if explicit two-site configuration is preferable to another navigation step. Recommendation: approve the narrow local factory, not a general CDK foundation package.

Verification: compare pre/post synthesized regional release templates and logical IDs, Lambda asset identities, runtime, SDK bundling and exact log settings; run focused release tests then the full gate. Function behavior, IAM, retries and resources must be unchanged. No deployment should be necessary when synthesis/assets are identical.

## 2. Project-local GatewayWorkload factory/module

Problem: EcsEndpointStack combines networking/host authority with the initializer, engine/DNS definitions, execution-role secret grants, task volumes and service startup/deployment conditions. The region recipe is already shared; this extraction is about keeping the workload's security contract together.

Proposed ownership: gateway execution role, task definition, initializer/engines/DNS, private RAM mounts, container capabilities/health/startup dependencies, service hook role, initial-empty service condition and gateway service. Return task definition/service/role references. The endpoint stack continues to own VPC/subnet/routes, EIPs, cluster, host role/instance profile, host-slot authority, GuardDuty transport and public outputs. HostSlotStack and the existing rollout machinery remain unchanged.

Illustrative composition:

```ts
const workload = createGatewayWorkload(this, {
  deployment, cluster, repositories, selectedImages,
  parameterPrefix, configDirectory, hookFunctionArn,
});
```

First implement as a cohesive factory/module using the same parent scope and existing resource IDs. A new child Construct class is not necessary for encapsulation and would introduce a path/identity migration. One gateway per endpoint stack remains the contract; no general ECS/Fargate options or plugin framework are proposed.

Invariants to keep together: only the initializer receives server secret values; engines and DNS have no task role; mounts are protocol-private/read-only; engines depend on initializer success and healthy DNS; capabilities remain engine-specific; the initial service stays empty until explicit host activation; unchanged releases and infrastructure updates preserve stopped/parked intent.

Benefit: clearer responsibility boundaries and easier review of coupled security rules. Cost: a modest stack now spans another module and its inputs, with extraction risk around role dependencies, initial-creation conditions and IDs. Recommendation: defer for now unless Anthony explicitly values this readability boundary enough to do it alongside the other work. The current stack is manageable, the region recipe already shared, and there is no current functionality gap. A thumbs-down now is a reasonable prioritization decision, not a claim that the proposed boundary is wrong.

Verification: exact baseline comparisons for all maintained active/parked templates, GuardDuty capability variants, user-data bytes and release identities; preserve existing architecture/permission/startup assertions and run the full gate. No runtime/image changes or cloud deployment are intended. Any resource replacement or changed host/application bytes fails this refactor's acceptance criteria rather than becoming an incidental deployment.

## 3. Explicit region-initialization operator command

Problem: Oregon and Zurich each needed local, target-specific credential-generation and private alert-contact helper scripts before the maintained import/activation/deploy commands could run. Generation/import primitives already exist; they need a repeatable operator entry point.

Implemented commands:

```sh
npm run init-region -- <target> plan --alerts-from <existing-target>
npm run init-region -- <target> execute <reviewed-plan-file>
```

The plan performs account/region/namespace metadata discovery and records exact inputs/actions/fingerprints without generating, decrypting or copying secrets. It identifies any existing state and refuses to imply that a region with retained identities is clean. The alert source is an explicit operator input, not a credential-source alias in the deployment catalog.

Execution rechecks the reviewed state, stages one fresh matching six-file server/device set privately, reuses the existing validators/conflict-refusing importer and initializes the explicitly selected alert contact without exposing its value. A local operation record identifies the same protected staging directory on retry; it contains no secret payload. If import fails after three parameters, resume with the same generated set and write only the missing values. Never regenerate on resume or delete existing values to force a match. Staging is temporary operation data, not a new mandatory backup: after complete verified import, Parameter Store remains authoritative. Missing staging during an incomplete import must produce an explicit recovery error, not silent identity replacement.

Existing credentials remain a deliberate boundary: an unrelated/conflicting set stops initialization. An already completed initialization can report that state without rotating identities. Historical cleanup/credential reset remains the separately authorized guarded purge workflow. No `--force` overwrite, automatic purge, region opt-in or account-security mutation is included.

Activation, CDK preflight/diff/deploy, profile export, GuardDuty coverage and host/client verification continue through their existing commands. Recipient SNS confirmation also remains external. This is an identity/contact initialization tool, not another deployment orchestrator or CloudFormation custom resource. It should not be invoked against an existing live exit just to prove the new command works.

Benefit: future region setup becomes reproducible, less dependent on session-specific scripts, and recoverable after partial failures. Cost: more implementation/test work than the two source extractions because it handles durable identities and retries. Recommendation: approve; it addresses the most visible operational repetition.

Verification: meaningful tests of wrong-account/region refusal, read-only plans, changed-plan rejection, existing/conflicting credentials, partial-import resume without key rotation, private file modes and redacted failures. Reuse existing import/validation tests and run the full gate. Keep live new-region initialization out of implementation verification unless a specific fresh target is separately authorized.

## Deferred boundary and decision process

GuardDuty abstraction remains deferred until the privacy/collection decision and a matching second consumer exist. Account detector/CloudTrail reconciliation must remain independent of application teardown. Notification constructs are already extracted; cross-project package sharing is a separate decision, not implied by approving proposal 1.

Approve/reject each proposal independently. If approved, implement each as its own verified work unit; do not conflate the no-behavior-change factories with the new initialization behavior. Clarify before execution if a vote changes scope. Preserve the user's git index and existing endpoints/credentials throughout.

Sources: current `infra/lib/releases/stack.ts`, `infra/lib/ecs-stack.ts`, `infra/lib/parameters.ts`, the notifications package and the protected local Oregon/Zurich helper source; [AWS construct guidance](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html), [logical ID/path behavior](https://docs.aws.amazon.com/cdk/v2/guide/identifiers.html). Logical IDs must remain stable even when file/module organization changes.

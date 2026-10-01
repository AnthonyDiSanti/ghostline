# Real gateway qualification — Ireland, September 28

Private target `blue-green-test`, root `GhostlineBlueGreenTest`, resource family `ghostline-blue-green-test`. No outbound ECR replication rules; candidate publication remains local. Preserved Standard Parameter Store credentials/recipient were reused without emitting values. Production and permanent registry membership are unchanged.

## Completed

- Five candidate images pass the local synthetic encrypted-protocol/image/package suite. The isolated v3 document selects official Bottlerocket 1.66.0. Central/native qualification is not yet recorded or published globally.
- Regional release support and shared root deploy. First desired-zero service creation invoked lifecycle hooks; `DescribeServiceDeployments` required an exact service ARN grant in addition to its deployment ARN. ECS otherwise surfaced the Lambda exception as a missing HookStatus. Corrected both deployment observation and StopServiceDeployment scopes using the AWS authorization reference.
- The preserved root `CREATE_FAILED` resumed through ordinary CLI deployment and reached `UPDATE_COMPLETE`; its failed service alone was recreated, with no host launch or production impact.
- Slot network creation and both production EIP bindings completed before host boot. Scoped launch-template creation rejected missing tags. Added explicit launch-template `TagSpecifications`; CDK's generic tags did not populate them. Explicit operator activation may resume preserved failure; background release processing cannot silently retry failed provisioning.
- Current full local gate passes 389 tests/67 files, including activation, effect-time guardrails, hook backpressure and explicit-failure retry tokens. No staging/commit.

## In progress / remaining

Initial host/runtime/client qualification and the second native handoff/five-minute bake have passed. Successful old-host retirement is complete. Remaining: deliberate post-cutover failure/rollback, interrupted handoff, stop/park/destroy/redeploy, central qualification, retained/imported Stockholm migration and parked Cape Town template update. Do not promote production from local tests alone.

Evidence: ignored `.local/blue-green/trial-gateway-deploy*.log`, `stage-trial.log`, `image-tests.log`, `full-integration-tests.log`; preserved CLI lifecycle receipt under `.local/deployments/blue-green-test/`. Resume the same deployment command after diagnosed failures; do not clear its claim to bypass exclusion.

## Migration feasibility (read-only)

AWS's resource-support matrix lists import support for the five host-slot types. Ireland `GetTemplateSummary` reports identifiers: InstanceId, NetworkInterface Id, LaunchTemplateId, TaskDefinitionArn, and ServiceArn plus Cluster. Retain/import remains the selected approach: CloudFormation's newer stack-refactoring workflow excludes LaunchTemplate and only handles fully mutable resource types. Keep exact source properties/user-data during ownership transfer; change placement eligibility explicitly before preparing green. Sources: [import support](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import-supported-resources.html), [retain/import workflow](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/refactor-stacks.html), [stack-refactor limits](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stack-refactoring.html). No production migration performed yet.

## Provisioning IAM corrections found during the trial

The launch-template tag fix exposed two distinct cleanup assumptions. Launch templates do not receive reserved CloudFormation ownership tags; their explicit `GhostlineHostStack` tag now scopes RunInstances/tagging/deletion for this resource type. Other EC2 resources retain their reserved-stack-tag checks. Updates that send only changed tags need a separate existing-ownership authorization from create-time request tags.

ECS `DeregisterTaskDefinition` and `DescribeTaskDefinition` do not support resource-level permissions. The CFN-only provisioning role therefore grants exactly those actions with `aws:RequestedRegion`; registration remains family-scoped. The Lambda receives neither operation and can pass this role only with the three immutable reviewed templates. Document this AWS limitation rather than claiming all CFN task-definition operations are ARN-scoped.

A failed tag update also failed CloudFormation's resource rollback. The next UpdateStack was correctly refused until RollbackStack repairs its last network-only checkpoint. The exact unreferenced trial launch template was manually removed during this exploratory repair after checking stack identity and absence of live consumers. Final fresh lifecycle qualification must still pass without this repair. Logs: `activation-diagnostic.log`, `repair-slot-rollback.log`, `update-trial-role.log`.

Provider-schema audit (`DescribeType`, six resource types; ignored `provider-permissions.json`) exposed further required stabilization reads. A later tag-only network-interface update invoked `AssignPrivateIpAddresses` for the unchanged declared addresses; the role now permits private-address/group setters only on the exact-owned slot interfaces. Selected credit/device attribute setters are similarly limited to owned instances. No SSM association creation, volume attachment, arbitrary host administration or extra engine authority was added. For the one-time migration, explicitly apply `GhostlineHostStack` to the imported launch template: its old reserved CloudFormation tags cannot establish this resource's ownership.

### First native host ready

Slot-a `i-03d6e5e495a05d2cf` boots Bottlerocket 1.66.0; the observed bootstrap identity matches the isolated candidate. The restricted daemon becomes healthy with no gateway engines. The fixed SSM observer reads its bounded loopback endpoint without privileged diagnostics. Both permanent trial EIPs remain on the same slot-a ENI. Shared root and slot stack are UPDATE_COMPLETE. Gateway activation is resuming its persisted deploy claim after a local AWS socket reset. Full local gate passes 377 tests/64 files plus typecheck, fixture lint and offline synth. This proves cold readiness, not yet gateway handoff or complete teardown.

### Initial gateway accepted; automated replacement underway

The original activation journal reached complete without host/EIP replacement. Maintained verification passes both protocol-private read-only tmpfs mounts, initializer exit/configuration equality, engine isolation, disabled host swap, memory limits and expected EIP egress. GuardDuty is HEALTHY (agent v1.17.1); temporary diagnostic authority is disabled and lockdown read back. Real encrypted HTTPS clients pass REALITY at 54.228.66.169 and AWG at 99.80.207.31. Mac native status is disconnected and actual routes use en0; OneXraySE window capture returned cgWindowNotFound, so no visual-status claim. No VPN settings changed.

Repeated local AWS ECONNRESET failures occurred on read-only DescribeStacks after long activation operations. Operator observation clients now retry only bounded transport failures for Describe/List/Get; mutation retries remain disabled. Setting desiredCount=1 has a separate bounded transport retry because that assignment is idempotent and never sets forceNewDeployment. Regression checks cover permission failure, retry exhaustion and no force retry.

The same-release qualification rotation now transfers its lifecycle claim to the deployed regional Lambda. Its upcoming proof must include scoped template provisioning, temporary EIPs, native callbacks, handoff, bake and complete retirement; initial host qualification alone does not establish these.

### Native hook throttling finding

First real replacement reached healthy green boot and application placement, but ECS immediately rolled back when POST_SCALE_UP received Lambda HTTP 429 (ReservedFunctionConcurrentInvocationLimitExceeded). It made one invocation attempt. The common controller's concurrency-one reservation was occupied by reconciliation. No production EIP moved; source blue stayed healthy and native rollback succeeded. Retained failed green now receives explicit cleanup.

Root fix: a separate thin ECS hook receiver, with capacity for callbacks, forwards to the same serialized controller and returns IN_PROGRESS on controller throttling or an uncertain transport acknowledgement. It has only exact controller InvokeFunction and log-write authority, no host/EIP/state/secret permissions. Genuine controller or permission errors still surface. This preserves one mutation authority and durable exclusion rather than raising controller concurrency. Native qualification must verify overlapping scheduled events and hooks with this receiver before promotion.

### Receiver-qualified handoff and bake

Second native deployment `PROvDqR4T4tBw__ehNTbp` is SUCCESSFUL. Both permanent trial EIPs moved from slot-a to slot-b (`i-02d6eda20b72a2234`, `eni-01d87b545b8b16f13`); the five-minute bake completed, and automated old-host retirement completed. Independent EC2 readback finds only the selected host, its two disks and the two original EIPs; both former hosts are terminated. Hook-only root configuration updates did not restart the gateway. Concurrent native callbacks and scheduled/manual reconciliation passed with the thin receiver.

Continuous real encrypted HTTPS requests saw no Xray failures and three AWG failures at handoff; successful AWG samples bracket a 25.258-second interval. This measures sampled request recovery, not uninterrupted existing sessions. Final counts: Xray 255/255 passed, AWG 252/255 passed. Both disposable client containers/RAM storage were removed.

ECS registration can precede SSM readiness. The fixed observer now treats only SSM InvalidInstanceId as pending observation rather than throwing; it never treats that absence as healthy, and bounded rollout deadlines still apply. The correction passes regression/full verification and was deployed under its own lifecycle claim after retirement completed. The next isolated rotation deliberately drains green during bake to exercise health-triggered native rollback. Production remains untouched.

### Ownership-transfer preparation

An ignored offline planner produces retain/detach/import/managed templates from the captured Stockholm baseline. It preserves the five host resource properties and user-data bytes, resolves only external root references and separately retains both association objects before removing their declarative ownership. CloudFormation GetTemplateSummary accepts the generated import template and confirms all five identifiers. No production changes occurred. Fresh snapshots, change-set inspection, a disposable rehearsal and actual ownership-tag readback are still required. The destination must remove Retain policies after import so later retirement does not leak resources.

AWS documents that DeploymentConfiguration updates do not themselves trigger a service deployment ([UpdateService](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_UpdateService.html)); the receiver-only root update also passed live without turnover. A rolling-to-blue-green migration still requires its own rehearsal and must not assume that changing the task definition is similarly inert.

### Actual post-cutover failure and native return to blue

Deployment `Ccm-NY_eeUaXGzglOCiS6` reached bake with both EIPs on healthy green. Setting only its container instance DRAINING did not stop its already-running gateway during bake. An exact-target StopTask then stopped only green's gateway while blue was freshly verified healthy. The controller observed two negative health samples, journaled one rollback request and invoked native ROLLBACK. ECS returned both EIPs through the hook and reached ROLLBACK_SUCCESSFUL. Failed green entered held; explicit cleanup completed, leaving blue as the only host with its two disks and original EIPs.

Encrypted request monitoring recovered on both protocols. Failure/recovery brackets: Xray 73.982 seconds (7 failed samples), AWG 105.615 seconds (11 failed samples). Earlier forward handoff in this trial had one Xray and two AWG failed samples (9.545/22.139-second brackets). These are sampling bounds, not zero-downtime or uninterrupted-session claims. Client containers/RAM were cleaned. Evidence: `rollout-failback.log`, `client-continuity-failback.jsonl`, `task-failure-injection.json`, `cleanup-failback.log` under ignored trial storage.

### Unsupported native cancellation removed

Calling ABORT on an older terminal disposable deployment returned explicit UnsupportedFeatureException: ECS StopServiceDeployment API with ABORT stopType is not supported. No running production deployment was targeted. The implementation now refuses unfinished native deployments through a read-only preflight before stop/park power intent changes or destroy freeze. Destroy acquires normal lifecycle exclusion before freezing the worker; it no longer steals a running release's claim. Complete/resolve native rollback before retrying lifecycle commands. This avoids deadlocking traffic hooks in an inactive mode. Regression/full verification passes 389 tests/67 files.

### Observation coverage refinement

Source review after the real task-failure test found that failure detection unnecessarily required a fresh SSM report even when EC2/ECS independently reported stopped/disconnected/unhealthy runtime state. A pure evidence classifier now recognizes those confirmed failures during bake without SSM, while missing SSM alone remains uncertainty. The full gate passes 391 tests/67 files; the controller-only Ireland update is underway. Host-loss native qualification and interrupted-handoff coverage remain pending. Do not infer those from the passed task-loss test.

### Partial-handoff fixture (removed)

Ireland's controller alone had temporary inline policy `GhostlineDisposablePartialHandoffFailure`, denying only AssociateAddress for trial AWG allocation `eipalloc-0aa4fc89369edcfda`. Preparation and Xray handoff remain permitted; the AWG move must fail, and native rollback must restore the completed Xray move while leaving AWG on blue. Exact role/policy identity is recorded in ignored `partial-handoff-policy.json`. The policy was removed after rollback readback, before cleanup; it is not product infrastructure. No production role/allocation is affected. Both encrypted clients were monitored during this completed trial.

### Partial handoff accepted

Deployment `pignQyaqRlSnPp3GPuyo7` reached ROLLBACK_SUCCESSFUL after the intentional exact-AWG-allocation deny. Xray first moved to green while AWG remained on blue, then native rollback restored Xray and both bindings returned to `eni-01d87b545b8b16f13`. Across 121 encrypted requests per protocol, Xray passed 120 and AWG passed all 121. The temporary inline deny was removed and ListRolePolicies confirmed absence. Client containers/RAM were cleaned; explicit green retirement completed.

The live read-only power preflight also rejected this unfinished deployment without changing lifecycle intent or freezing hooks. The full gate now passes 393 tests/67 files. A further controller-only change extends independently confirmed runtime-failure observation through an already-started traffic handoff and post-shift hook, as well as bake; missing SSM alone remains unknown. Its Ireland deployment is queued behind cleanup. Production remains unchanged.

### Stop/repeated-stop/start accepted

The maintained CLI stopped the gateway and daemon before EC2, repeated stop safely, then restarted the same slot-b instance. Cold daemon health preceded gateway desiredCount=1. Both encrypted clients pass after restart. Independent observation confirms unchanged EIPs, all credential parameter versions and five runtime digests, with new successful boot `d4d74280-92f0-40e5-a221-5cd8afcd4077` on `i-02d6eda20b72a2234`. No new native blue-green deployment was created by restart. Private before/after evidence and CLI logs use `power-*` / `lifecycle-*` filenames.

The refined handoff health classifier is deployed. A live disposable retain/import round trip is now rehearsing ownership transfer while client requests continue. Its exact resume journal is `.local/blue-green/ownership-rehearsal/journal.json`; the CLI owns `ownership-rehearsal` exclusion. Do not run park/destroy or clear that receipt during the transfer.

### Retained-resource ownership transfer

The running Ireland slot-b transferred all five retained resources into an intermediate owner and back into a newly imported normal slot stack. Exact resource properties/IDs, EIPs, host boot, task revision and image digests survived. Replacement-deny stack policies protected ownership-only updates; normal prior policy, provisioning role, Outputs, cost/ownership tags and Delete policies are restored. Intermediate owner removed and lifecycle claim completed. First monitor stopped on a local transport error with 235/239 Xray and 238/239 AWG successes; resumed monitor passed 83/83 per protocol and removed its containers/RAM. Private journal/evidence: `.local/blue-green/ownership-rehearsal/`, `ownership-rehearsal.log`, `client-continuity-ownership-first.jsonl` and `client-continuity-ownership-resumed.jsonl`.

### Strategy and lifecycle continuation

Ireland ROLLING/BLUE_GREEN strategy round trip preserved running task, task definition and native deployment inventory. Park found a successful-empty-waiter parsing bug in deployment.ts; fixed to accept empty output, matching the ECS/destroy adapters. The migration template review also found that CLI-added CDK metadata differs from offline synth despite identical GatewayTask properties; deployment classification now ignores that metadata and analytics resource. Regression tests distinguish real task properties from service/retention changes. Full gate passes 395 tests/67 files plus typecheck, fixtures and fresh synthesis. Park and repeated park pass. Independent audit confirms zero EC2 instances/EBS disks, both original EIPs retained and detached, and all credential versions unchanged. Unpark passes through the maintained CLI: new host i-053d0186495b80eda, one host/two disks, same EIPs/credential versions/runtime digests and HEALTHY GuardDuty v1.17.1. The normal command recreated networking, established bootstrap/cold-daemon readiness and then started the gateway, with no manual dependency cleanup. Evidence: lifecycle-unpark.log and lifecycle-audit-unparked.json.

Both real clients pass after unpark (`lifecycle-unpark-clients.log`). A repeated unchanged `ecs deploy` has a clean CDK diff and preserves the exact observed generation plus native deployment history (`noop-before.json`, `noop-after.json`, `lifecycle-noop-deploy.log`). No host or task restart.

### Whole-host-stop rollback

Native deployment `sGYyXENLG68OlSU_MIYoy` reached verified bake with both generations healthy. The isolated injector stopped green `i-03814d527ca8bb6d9` at 08:10:31.909 UTC; blue `i-053d0186495b80eda` stayed running. Confirmed host failure triggered one native rollback despite unavailable green SSM. Both production EIPs returned to blue; native result ROLLBACK_SUCCESSFUL. Client samples bracket recovery at 85.731 seconds Xray and 128.773 seconds AWG, with 134/143 and 128/143 total successes respectively (totals include the earlier forward handoff). Both protocols passed before the monitor ended; test containers/RAM were removed. This tests an EC2 stop, not abrupt power loss or kernel corruption. Exact failed-green cleanup is underway. Evidence: rollout-host-loss.log, host-failure-injection.json, client-continuity-host-loss.jsonl, cleanup-host-loss.log.

### Whole-host-stop cleanup correction — September 28

Native rollback succeeded, but an offline agent left lastStatus RUNNING for already-stopped processes while its registration reported zero running/pending tasks. The controller now non-forcibly deregisters only a verified stopped, disconnected, zero-count host, then reobserves registration absence. Running-host drain checks remain unchanged. AWS required both exact cluster and container-instance IAM scopes. The reviewed Ireland-only updates preserved the cleanup claim and restored invokers/concurrency; the same action reached cleaned at 08:39:58 UTC after host/disks, ENI and temporary-EIP retirement. Full Node 24 verification passes 397 tests/67 files. Evidence: offline-cleanup-iam-maintenance.log/json and cleanup-host-loss.log. Independent absence audit and central qualification follow; production remains unchanged.

Independent cleanup audit passed: one surviving host, two disks, original two EIPs, unchanged runtime images and credential versions. Native qualification completed at 08:42:20 UTC; private read-only RAM, absent engine secret environment, disabled swap, correct protocol egress, 1,126 MiB task limit and HEALTHY GuardDuty v1.17.1 passed. Diagnostics are disabled. The tracked platform qualification binds exact bootstrap/daemon artifacts to official 1.66.0 and preserves the known upstream startup limitation. Full regional destroy/rebuild remains a separate acceptance gate.

The maintained full Ireland destroy and repeat-destroy commands completed with empty pending lists and no manual dependency cleanup. The expected retained classes are expiring logs/dead letters, Standard Parameter Store credentials, regional GuardDuty and independent account CloudTrail. Independent absence audit and a fresh redeploy/client check remain before production migration.

### Fresh rebuild accepted — September 28

Support and fixed-name resources recreated without collisions, retained release history/candidate were seeded into the isolated local repositories, and maintained `ecs blue-green-test deploy` completed without manual dependency repair. New host i-0be3cfcec25505244, one host/two disks/two EIPs; all credential versions and qualified image identities preserved. Both real encrypted clients pass (Xray 54.76.112.172; AWG 54.194.74.140) with native VPN disconnected and actual Mac routes via en0. Fresh native isolation/RAM/configuration/egress/memory checks pass; GuardDuty HEALTHY v1.17.1 and diagnostics disabled. Evidence: lifecycle-rebuild-{support,images,gateway,clients,verify}.log, lifecycle-audit-redeployed.json and fresh-acceptance.json. Production migration remains separate; this region is still running until final cleanup.

### Slot-B diagnostic correction — September 28, 10:59 UTC

After production migration exposed its slot-A-only daemon-family selector, `diagnostics.py` now checks the two exact slot families plus the `network` container label and rejects missing/ambiguous matches. Regression coverage includes both slots and unrelated families/containers. Local synthetic image/protocol tests pass; only bootstrap executable bytes change (other rebuilt outer indexes contain new provenance only). The Node 24 full gate passes 396 tests/67 files.

Ireland was fully destroyed, repeat-destroyed and independently audited, then recreated without manual dependency repair. Current baseline host was `i-092b5e61b42f2cf69`; ECR candidate publication alone started rollout `d24e3fbe8ff0cb6f76aa518edc98819aff08a177724426e33025e867ce50ba7f`. Corrected slot B host `i-0117203bb605c59a2` booted and received both EIPs. Maintained native verification now passes the exact former failure site, configuration hashes, private RAM, SELinux/seccomp/capability isolation, memory, EIP egress and HEALTHY GuardDuty. Diagnostic/admin lockdown passed afterward. The client CLI refused while deployment was still baking, as designed; rerun after completion. Source retirement, replay qualification, global publication and final cleanup remain pending. Private logs: `diagnostic-*.log`.

Candidate rollout/source retirement completed at 11:12 UTC. Maintained stop/start replay preserved host `i-0117203bb605c59a2`, both EIPs, credential versions and all runtime digests; new boot `e4006c00-b8f9-4429-a9cd-59d94897123e` proves replay. Both native encrypted clients pass after stable restart. `platform qualify` recorded the corrected exact artifact on 1.66.0 after a second full native verifier/lockdown and HEALTHY GuardDuty check. Evidence: `diagnostic-power-{before,after}.json`, `diagnostic-qualified.log`, `diagnostic-replay-clients.log`; central candidate `.local/blue-green/qualified-diagnostic-fix.json`. Production publication and disposable cleanup follow.

### Final disposable cleanup — September 28, 11:45 UTC

The maintained destroy and repeat-destroy completed after diagnostic qualification with no pending work. Independent inventory confirms zero owned hosts, disks, EIPs, networking, repositories, controller functions/state/rules/alarms and exclusive Lambda asset bucket. All seven credential parameter versions remain unchanged. Expiring logs/dead letters, Standard parameters and independent GuardDuty/CloudTrail are deliberate survivors; this is not a claim of an instantly zero account bill. Evidence: `diagnostic-final-destroy.log`, `diagnostic-repeat-destroy.log`, `diagnostic-destroy-audit.log` and `lifecycle-audit-destroyed.json`.

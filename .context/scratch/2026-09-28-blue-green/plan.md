# Direct-EIP blue-green implementation

Current implementation status (September 28): the selected native ECS/direct-EIP architecture is implemented and qualified, including successful and failed disposable rollouts, full lifecycle cleanup/rebuild and production ownership transfer. Stockholm's second publication-triggered rollout succeeded at 11:50 UTC and finished source retirement at 12:00 UTC; Cape Town is parked. The entries below preserve checkpoint chronology, not competing implementation directions. Final production security verification passed October 1; see [handoff](../../handoff.md) for the next work unit.


## Selected contract

Anthony selected headless ECS BLUE_GREEN with direct Lambda lifecycle hooks, no NLB and no permanent spare. Every meaningful app/daemon/bootstrap/OS release uses a temporary second host. Keep protocol credentials and matching ingress/egress EIPs. Observe for five minutes; return once to healthy blue after failure. Retain failed green running until explicit cleanup, block subsequent releases and send daily cost reminders. ECS may stop failed application containers; retaining a host does not guarantee preserved running tasks or RAM. Scheduled cloud builds are a separate work unit.

Resolve latest official Bottlerocket centrally, qualify it, then publish the exact version in the release. Regional delivery resolves the matching official AMI rather than choosing an untested newer version. No per-region protocol qualification gate; readiness checks do not prove browsing.

## Checkpoints

1. Capture current ownership/templates and prove headless ECS support before provisioning the full trial. Then prove native hooks, same-definition force rollout, isolated daemon selection, placement, bake and rollback with two disposable hosts. Stop before production if the required native contract is unavailable.
2. Split shared regional resources from two reusable host slots (`a`, `b`), each with absent/network-only/running phases, distinct private addresses and a placement-constrained daemon service. Preserve the shared bridge gateway task. CDK owns allocations/templates/static image references; the controller exclusively owns changing EIP associations. Prepare networking/EIPs before boot, update only approved host-stack lifecycle parameters and keep immutable resource identity checks.
3. Version whole-stack intent with a qualified target OS; extend observations/journals/retention for both slots and diagnostic holds. Old documents are read-only historical references until no longer retained or running. Observe actual component identities, not just aliases.
4. Extend the current controller/lock with ECS hooks through a thin InvokeFunction-only receiver (return IN_PROGRESS while the sole mutation worker is busy): prepare green, verify nonsecret readiness, journal each EIP swap and restore blue management using displaced temporary IPs, observe five minutes, then retire blue only after authoritative completion. Return both EIPs on native rollback only after checking blue. Set finite preparation (30m) and association (5m) deadlines; do not broaden the Bottlerocket retry exception. Use durable state across hooks and hourly reconciliation; enable minute continuation only while pending.
5. Add status/cleanup-failed controls; require cleanup before retry. Make stop/park/destroy understand both recorded generations and preserve inactive power intent. Keep independent security and existing retention semantics.
6. Pass behavioral tests, package/security checks, full Node 24 infra gate and fresh diffs. Qualify failure injection/real encrypted protocols centrally in a disposable region. Migrate Stockholm through retained/imported resource ownership; upgrade Cape Town while parked. Remove obsolete in-place release paths and migration scaffolding after adoption; update canonical docs and whole-dirty-state commit proposal without staging.

## Evidence and current status

Implementation started September 28. Production templates/ownership captured in ignored `.local/blue-green/baseline/`; Stockholm and parked Cape Town stacks are UPDATE_COMPLETE. AWS identity verified in the expected account. A zero-host, zero-IAM ECS contract probe in Ireland is synthesized before the costlier full trial. Probe desiredCount is zero; no image is pulled or workload qualified by this check. Existing production/release resources remain unchanged.

Upstream watch refreshed September 28: Amnezia #2933 open (latest 5.0.3.0); core-kit #1059 and PR #1063 open/unmerged (official Bottlerocket latest 1.66.0); IPv6 #4954 open/no feedback. No official repair identified.


### Native contract complete; production integration underway

[Native evidence](native-ecs.md) passes headless callbacks, five-minute bake, same-definition force, isolated daemon update, hook-failed rollback and controller-requested rollback with a delayed return hook. Both disposable stacks are DELETE_COMPLETE; both hosts are terminated and Ireland has no EBS volumes. Production remains unchanged.

Source foundations now include a strict EIP handoff planner, deployment-hook identity/direction checks, v3 qualified-OS metadata with historical v2 reads, a nonsecret loopback daemon readiness observer, and CDK host-slot/temporary-address templates. These are not yet integrated into the regional controller or deployed. Next implement durable orchestration and exact AWS adapters, shared/slot IaC ownership and CLI lifecycle integration. The full production migration remains outstanding; do not deploy the partially refactored recipe.

Slot ownership refinement: keep the temporary EIP pair in a distinct short-lived address stack, independent of both slot ENIs. Retirement is drain + actual task stop, network-only (host removal), detach temporary addresses, absent (ENI removal), then delete the transient allocation stack. Keep default boot placement eligible for recovery; change candidate selection transiently under the lifecycle lock for intentional rollout.

### Orchestration-core checkpoint

Full gate: 401 tests/61 files. The new (not yet wired) controller journals uncertain force requests before sending, recovers exact native revision identities from ECS history, permits reverse hooks during a safety hold, checks fresh boot/OS/bootstrap/engine/daemon evidence, and sequences actual task stop before host, association, ENI and transient-allocation retirement. Partial CloudFormation creation is inventoried from physical resources, not success-only outputs. Explicit cleanup is required before retry; missing health evidence cannot authorize failback.

Still required: connect root/release IaC and Lambda/CLI entrypoints, handle initial activation and IaC lifecycle-lock handover, retain both generations in image cleanup, qualify actual restricted artifacts/readiness/EIP transitions and stop/park/destroy, then migrate production retain-first. Do not deploy the intermediate source.

### Integrated source checkpoint

Shared root, slot-template assets, scoped CFN service role, Lambda hooks, initial empty-service activation, CLI lock transfer, both-slot teardown, qualified-version AMI selection and generation-aware image retention are connected. Old in-place action selection/controller/update commands are removed. Full gate: 366 tests/61 files plus typecheck, fixture checks and fresh synth. Synthetic image/protocol suite passes; candidate readiness still needs real host qualification. Main `deploy` delegates to the same ECS lifecycle command. Controller infrastructure updates occur under the endpoint's CLI claim to prevent an hourly event preparing a competing rollout.

Ireland trial starts with held release automation and no outbound replication rules. Do not promote candidate qualification metadata globally until native tests and migration preparation pass. Existing root-owned production is guarded against accidental replacement/deletion by the new shared template.

### Historical qualification checkpoint

All source paths are integrated; earlier intermediate checkpoints above are historical. Successful handoff/bake/source retirement, task-loss rollback, partial EIP-handoff rollback, whole-host-stop rollback, stop/repeated-stop/start, park/repeated-park/unpark, unchanged deploy and retained/imported ownership rehearsal have passed in Ireland. Whole-host-stop cleanup exposed stale ECS task status and is being qualified with guarded non-forced deregistration. The Node 24 full gate currently passes 397 tests/67 files. Remaining: finish that cleanup, record central qualification, full destroy/repeat-destroy/fresh redeploy, controlled Stockholm ownership migration/rollout, parked Cape Town adoption and final disposable cleanup. Production and the index remain unchanged.

## Production migration and diagnostic closeout complete

Earlier checkpoints are historical. The complete success/failure/lifecycle matrix and destroy/redeploy pass, and production ownership adoption/Stockholm cutover/source retirement are complete. Cape Town remains parked on the common controller. Final runtime verification exposed a slot-A-only diagnostic lookup; the correction passed central qualification, publication and a second automatic Stockholm rollout. The explicitly approved production verifier passed October 1 with diagnostic/admin lockdown and HEALTHY GuardDuty. See the current handoff and migration record rather than the obsolete production-unchanged statements above.

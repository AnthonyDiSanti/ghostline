# Logging remediation plan

Status: core logging fix deployed November 17, 2026 in all four active regions after central native qualification. Eight encrypted-client, four security and four bounded log-policy checks pass; Cape Town stays parked. [Release evidence](../2026-11-17-zero-logs-release/README.md). Credentials/endpoints and GuardDuty policies are unchanged. Secret delivery, host/dump/cloud-error review and the next AWS privacy decision remain open.

## Selected starting goal

Make normal operation produce **no durable record of client addresses or identities, DNS questions, browsing destinations, URLs, or individual traffic flows in Ghostline-controlled sinks**. Sensitive diagnostics should be off by default; any future diagnostic buffer must be bounded RAM with an explicit lifetime and no automatic disk/cloud export.

Keep the current durable identity/recovery model: regional Parameter Store and installed device profiles. Retain narrowly defined infrastructure/security records that do not contain user traffic, with documented retention. These are explicit exceptions to a literal all-sensitive-state-in-RAM requirement, not an assertion that every sensitive byte disappears at shutdown.

Track two results separately:

- **Application logging fixed:** known access/query/error leaks are removed and tested. This should ship first.
- **Memory-only sensitive runtime state qualified:** host journals, dumps, initializer metadata and off-host collection are addressed or explicitly disclosed as exceptions. Do not claim this result just because the application fix ships.

If the requirement is literally no persistent sensitive state or no AWS-held connection metadata at all, the current credential stores and AWS architecture do not satisfy it. That would need a separately chosen architecture/recovery change. ISP timing, resolver/destination records, cookies and account identity remain outside the project logging guarantee.

## First-round working inventory

The owner selected the recommended starting level and a bottom-up approach. This list guides priorities rather than creating hard exclusions; address connected recording paths as implementation reveals them. Keep the larger evaluation open without requiring a platform redesign before the known leaks are fixed.

1. **Xray access/error/DNS output (F01):** enforce an explicit normal-mode logging invariant in the rendered configuration, including REALITY debug output. Stored optional fields must not re-enable access logging. Preserve identities and protocol settings.
2. **Resolver failure names (F02):** remove per-question error output and review other CoreDNS logging paths. Keep health/readiness signals without client questions or answers.
3. **AWG, wrappers and network/bootstrap errors (F03):** review normal/startup/rejection/failure output; use supported quiet settings and fixed diagnostic codes rather than raw exceptions, peers, arguments or configuration text.
4. **Cloud operational records (F06–F08):** inspect controller, hook, notification and framework logging plus SNS, failed-event queues and SSM command/output paths. Prevent arbitrary event/error payloads from bypassing sanitization; retain useful fixed health/failure records and appropriate current retention.
5. **Host persistence and crash paths (F03):** verify how application output reaches Docker, journals, health metadata, checkpoints and dumps. Use straightforward supported controls where justified. A persistent infrastructure journal is not automatically a browsing log; prove what sensitive data reaches it before changing the platform.
6. **Credential and artifact leakage (F04/F09):** guard startup/validation/crash paths against secret disclosure; inspect initializer environment persistence using synthetic values. Preserve deliberate Parameter Store/device identities. Reduce unnecessary new production exports, raw diagnostics and copied benchmark histories. Review existing deletions separately so unique recovery material is not lost.
7. **AWS security collection (F05):** keep Runtime Monitoring, malware protection and shared account controls enabled for round one while recording their concrete privacy costs. Review supported granularity and actual evidence; exclusion is an option, not a prerequisite or current recommendation. This remains part of the evaluation and a limitation on any broad no-logging claim.
8. **Regression proof and delivery (F01–F10):** test successful traffic and failures with synthetic markers through every applicable sink, check deployed policy and unchanged credentials/endpoints, and use the existing central qualification/blue-green process. Enumerate historical records and remaining provider/client/ISP boundaries honestly. No anonymity or shutdown-erasure claim follows merely from suppressing application logs.

## Current implementation checkpoint

- **Delivered:** enforced Xray logging/REALITY silence in RAM, quiet new-profile defaults, query-free CoreDNS failures, supported AWG silence and fixed AWG/network/tool errors. Stored identities and other protocol settings are preserved.
- **Verified:** 484 tests/75 files, full local gate, six ARM64 image checks, central native qualification and four successful blue-green rollouts. Eight encrypted-client smoke tests and four security/log-policy probes pass. [Evidence](../2026-11-17-zero-logs-release/README.md).
- **Lifecycle correction:** defer optional image cleanup safely during protected publication, releasing exclusion; retain ownership on genuine uncertain deletion failure. The CLI-only fix preserves runtime build/native identities.
- **Remaining:** supported removal of initializer environment persistence, fixed-schema cloud/framework/failed-event review, host journals/dumps and the GuardDuty policy decision. Each active host still has two nonempty credential bundles in disk metadata; GuardDuty remains enabled. No overall zero-log or RAM-only claim follows.

## Next recommendation for owner discussion — November 17

Updated after owner discussion: Anthony selects Ghostline-host Runtime opt-out as the direction and requests the credential-delivery design/decision points. He chooses fixing persistence at its source instead of temporarily excluding EBS data volumes. Production remains as deployed. The [concrete next-unit plan](../2026-11-17-zero-logs-release/credential-delivery-plan.md) supersedes the earlier temporary-exclusion recommendation.

1. **Remove the extra disk credential copy next.** Keep Parameter Store as the deliberate durable identity store. Stop injecting plaintext server bundles through ECS secret environment variables. Retrieve into the existing private tmpfs during trusted preparation; no secret values or usable substitute bearer credentials may appear in Docker config, ECS checkpoints, argv, user data, diagnostics, images or crash artifacts. Preserve current keys/endpoints and read-only per-engine mounts. Do not edit Docker's private metadata files in place.
2. **Prove preferred A; retain a practical runtime-fetch fallback.** Anthony now prefers bootstrap-prepared RAM for sensitive runtime state while retaining ECS execution-role retrieval. He rejects off-host push B because restart/recovery coordination is not worthwhile, and accepts running-task Parameter Store access if necessary. The host bootstrap already mounts config RAM before Docker/ECS; the ECS initializer only writes it later. Qualify supported runtime-store integration, memory and reboot/checkpoint behavior before selecting production A. A runtime-fetch fallback may use the existing initializer and narrowly scoped task authority, with the whole-task/engine consequence recorded explicitly; no IAM expansion is applied. [Current boot proof, A gates and fallback](../2026-11-17-zero-logs-release/credential-delivery-plan.md).
3. **Remove only Ghostline-host Runtime Monitoring; keep EBS scans.** Stop/disable the actual Bottlerocket host agent, prevent re-enrollment with EC2 exclusion tags at launch, remove project-only plumbing and update IaC/enabler/qualification/verification together. Retain SSM/control, the network daemon, OS/data-volume malware scans, shared CloudTrail and other workloads' monitoring. The temporary EBS data-volume exclusion proposal is withdrawn at Anthony's direction. Runtime removal loses live process/file/network intrusion detection and some scan triggers; retained scans are agentless and remain eligible. The RAM mount already lies outside EBS scanning.
4. **Treat foundational flow analysis as a later account-boundary decision.** Host/volume exclusions do not stop GuardDuty's bundled regional CloudTrail/EC2-flow/AWS-DNS analysis. If the requirement is no GuardDuty VPN-flow processing, prefer a dedicated Ghostline account before suspending/disabling the corresponding detector, avoiding reductions for unrelated projects. This does not remove underlying AWS/ISP correlation. No immediate account migration or shared detector change is proposed as a prerequisite to the first improvement.

Acceptance for credential delivery: synthetic markers absent from Docker/ECS persistent state, journals/logs and dumps; actual private read-only tmpfs, identity equality, zero engine AWS access, missing-secret fail-closed behavior, cold boot/task restart/stop-start/blue-green recovery and smoke tests. After qualification, replace hosts through the common lifecycle; do not claim deletion of historical provider-held copies. A literal no-sensitive-data-on-disk result remains unproved until these tests and the broader host/cloud review pass.

Sources: [AWS secret-volume pattern](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html), [task-role scope](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RegisterTaskDefinition.html), [EC2 task isolation caveat](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html), [runtime enrollment](https://docs.aws.amazon.com/guardduty/latest/ug/how-runtime-monitoring-works-ec2.html), [scan exclusions](https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection-customizations.html), [bundled foundational sources](https://aws.amazon.com/blogs/security/get-to-know-amazon-guardduty-runtime-monitoring-for-amazon-ec2/).

## Order of work

These units cover both the first round and later qualification. Round one combines R1, straightforward supported fixes from R2/R4, R3 review with coverage retained, and R5 verification. A full RAM-only platform redesign or production debug feature is not a prerequisite for shipping the known-leak fix.

| Unit | Deliverable | Dependency / completion gate |
| --- | --- | --- |
| R1 | Stop application traffic logging; qualify and release that fix | Deployed and smoke-verified November 17; broader host/cloud boundaries remain |
| R2 | Qualify host persistence and secret-metadata boundaries | Required before a memory-only claim; does not delay R1 |
| R3 | Review AWS collection and the value of existing protection | Keep current coverage during round one; any reduction needs a concrete evidence-backed decision |
| R4 | Minimize cloud/local operational records and define diagnostics | Requires a fixed data schema; RAM diagnostics depend on R2 |
| R5 | Verify the combined result and handle historical residue | Release gates plus a separately reviewed deletion manifest |

Preserve the existing engines, device credentials, EIPs, shared gateway task, restricted network daemon and supported release lifecycle. Reuse the recorded engine/OS selections; do not bundle an upstream protocol upgrade with privacy remediation.

## R1 — Stop the records we deliberately generate

### Xray

Enforce this normal-mode policy at the RAM-rendering boundary, rather than depending on optional fields in five separately stored bundles:

```json
{
  "access": "none",
  "error": "none",
  "loglevel": "none",
  "dnsLog": false
}
```

Also keep REALITY diagnostic `show` off and prevent unapproved access/query/statistics exporters from bypassing the policy. The [pinned Xray implementation](https://github.com/XTLS/Xray-core/blob/v26.3.27/infra/conf/log.go) supports explicit suppression; error severity alone is insufficient.

Recommended design: identity/protocol settings remain owned by Parameter Store; operational logging policy becomes owned by the initializer. The renderer applies one authoritative policy to its private RAM output. Persisted logging fields cannot re-enable collection. This intentionally changes the current exact-config-byte rendering contract and corresponding tests/docs; it must not alter keys, UUIDs, peers, endpoint selection or non-diagnostic protocol behavior. Compare only permitted logging/diagnostic subtrees as changed, and verify all protected fields for equality without printing them. Leave stored credential payloads untouched for this change.

Primary touchpoints: [config renderer](../../../runtime/ecs/config-start.sh), [bundle validation](../../../infra/lib/xray-config.ts), and the existing Xray/config/image tests.

### CoreDNS, AWG and network diagnostics

- Remove per-question CoreDNS `errors` output from normal mode. Audit independent plugin/server error paths too; simply deleting the directive is not the acceptance test. Preserve fixed-name health checks and exit-status health reporting. [CoreDNS error implementation](https://github.com/coredns/coredns/blob/v1.15.0/plugin/errors/errors.go).
- Select AWG's explicit silent logger setting in normal mode and review wrapper/tool failures separately. The [pinned daemon](https://github.com/amnezia-vpn/amneziawg-go/blob/b5928efb6ca19f0153958460c3d141f04abc5c2e/main.go) has a `LOG_LEVEL=silent` branch; that does not by itself silence every startup or tool message.
- Replace free-form network-daemon exception text and configuration/tool diagnostics with fixed reason codes. Preserve health/failure signaling so privacy does not hide a failed gateway. No raw exception, peer, request, key or destination should cross the persistent logging boundary.
- Use exit status, health state and a small allowlist of fixed operational messages for troubleshooting. Avoid a blanket “discard stderr” wrapper as the sole evidence that the underlying system meets the policy.

Primary touchpoints: [Corefile](../../../runtime/ecs/dns-policy.Corefile), [AWG startup](../../../runtime/ecs/start.sh), [AWG container](../../../runtime/ecs/awg-start.sh), [network daemon](../../../runtime/ecs/bottlerocket/daemon.py), [task definitions](../../../infra/lib/ecs-stack.ts).

**Acceptance:** synthetic successful/rejected connections, normal/failed DNS, invalid configuration and startup/shutdown errors contain no unique client/destination/query/credential markers in any enabled sink. Run against the real pinned binaries, not only mocked logger functions. Assert all regional rendered configurations and preserve existing authenticated traffic/health behavior.

Ship this as a qualified application/fixture release through the normal blue-green path. It closes known leaks while R2 and R3 remain separately recorded limitations. The first release must not be described as fully RAM-only.

## R2 — Establish what the host really persists

First use an isolated official ECS-3 ARM64 host with synthetic credentials and marker traffic to map effective storage:

- Docker JSON logs, stopped-container metadata, health-check output and ECS checkpoints.
- System journal, ECS/containerd/Docker/SSM/GuardDuty service output, kernel/audit paths and support bundles.
- Process core dumps, kernel crash/pstore paths, swap and hibernation behavior.
- Initializer environment copies versus the intended tmpfs config mounts and `/run` state.

Use scoped probes that return only schema, filesystem type, permissions, marker-presence booleans and counts. Never export real Docker environments, complete configs or production traffic. Inspect diagnostic lockdown before/after any approved host probe.

The [qualified host journal is persistent](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/release/release-systemd-journald.conf); source suppression in R1 reduces what reaches it but does not change its storage. The [secret boundary](../../../docs/secrets.md#ecs-delivery-and-threat-boundary) already acknowledges durable initializer-environment metadata.

Then decide whether the official platform supports the required result:

1. Use supported settings to prevent sensitive dumps/exports and keep any required sensitive diagnostics in a bounded tmpfs buffer. Keep only demonstrably sanitized infrastructure events on persistent storage if that exception is accepted.
2. Investigate a supported secret-delivery design that avoids plaintext in persistent runtime creation/checkpoint metadata while keeping engines without AWS roles and keeping host bootstrap free of application-secret retrieval.
3. If those constraints cannot be met together, stop at a concrete design decision: accept and document the narrow residual, or separately approve a platform/secret-delivery redesign. Do not invent an unsupported fix to mark the item complete.

Specifically, unsetting an environment variable, unlinking Docker files, deleting an exited initializer behind ECS, reducing log rotation, or selecting an intermediate memory buffer does not establish disk-free secret handling. No generated `/etc` patch, custom agent fork or host-wide tmpfs relocation is assumed to be acceptable.

**Acceptance:** on the isolated host, synthetic sensitive markers are absent from persistent storage and configured exports after failures, task restarts, reboot and stop/start. Distinguish a task stop (host RAM can remain) from host shutdown. If a bounded diagnostic buffer is implemented, verify expiry and shutdown loss under its declared lifetime. Report filesystem/marker evidence rather than claiming physical sanitization or provider-wide deletion.

## R3 — Review AWS collection before reducing protection

**Round-one position: retain Runtime Monitoring and malware scanning while fixing Ghostline's confirmed logging paths.** The earlier proposal to exclude both by default was premature: the two features create different exposures, and neither has been shown here to retain a complete Ghostline browsing history. The owner asked for the concrete risk before deciding. Preserve account-level enable-only protection and the current host-enrollment/HEALTHY-host contract unless that decision changes.

| Boundary | Concrete privacy exposure | What the audit does and does not prove |
| --- | --- | --- |
| Runtime Monitoring | A privileged agent can export DNS payloads, process arguments and connection endpoint metadata after VPN decryption | AWS documents these fields and the audit found healthy agents. The exact export of Ghostline's translated internal DNS, event completeness and raw-runtime retention remain unverified. This is not evidence of HTTPS content decryption or a customer-accessible complete access log. |
| EBS malware scanning | A triggered/on-demand scan snapshots existing disk state and creates a service-account replica; logs or initializer metadata already on disk can be copied | The plan is enabled and retained-snapshot preservation is off. No scan history was inspected; no Ghostline scan or actual secret copy was proven. It is not an independent live packet recorder. |
| Foundational GuardDuty | AWS analyzes independent network/account streams and extracts profiling fields even without customer flow-log resources | Removing the runtime agent does not remove this boundary. AWS states that it discards input logs after extraction; that is not a guarantee that profiles/findings contain no sensitive metadata. |
| Shared CloudTrail | Administrative identity, API requests and documented partial STS responses persist separately | The audit's bounded content sample does not show a reusable credential set or a per-visit browsing diary. Preserve this account-security purpose. |

[AWS runtime-event documentation](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring-collected-events.html) is the collection-capability source. Applied to the current topology, an Xray destination socket can expose its remote endpoint to process-level observation, and decrypted DNS on the engine-to-CoreDNS bridge is a possible question-collection point. AWG forwards inner traffic through its tunnel/network path, so do not assume every inner flow becomes a process `connect` event. Actual export details remain unqualified.

[AWS malware-scan documentation](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_malware_protection-ebs-volume-data.html) describes encrypted disk replicas and temporary retention even with snapshot preservation off. Removing sensitive disk records reduces what such a snapshot can contain, but initializer credential metadata remains a separate risk. Do not infer that disabling log output removes that metadata. These are additional copying/trust boundaries, not proof that AWS is misusing the information.

Retaining these features provides compromise detection that can protect privacy: a compromised gateway could capture live traffic regardless of the intended logging policy. Excluding runtime coverage loses process/container/file/network detections; excluding disk scans loses malware detection. Qualified images, limited IAM, isolation and patching help but are not equivalent replacements. The low-cost first step is to stop deliberately persisting traffic and then assess the residual collection against that protection value.

If later evidence or the selected privacy guarantee warrants reduced collection, review runtime and malware features separately. Prefer supported resource-scoped controls over detector-wide changes; NVA shares account-wide settings with other workloads. [Bottlerocket exclusions](https://docs.aws.amazon.com/guardduty/latest/ug/prereq-runtime-monitoring-ecs-ec2-bottlerocket-support.html) require launch/tag/IMDS consideration, while [agent-management disablement alone does not stop collection](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring-agent-resource-clean-up.html). [Malware resource exclusion](https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection-customizations.html) is a separate choice. No finer DNS-only/field-redaction control was established in this review; do not invent one or assume a findings-suppression rule stops collection.

**Acceptance for round one:** retain observed coverage and other workloads' settings, document confirmed capabilities versus unknown export/retention, and account for this remaining AWS boundary in the final privacy statement. The application logging fix can pass with this limitation disclosed, but the overall no-persistent-traffic-history objective cannot be declared proven across AWS while the boundary remains unresolved. [Foundational analysis](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_data-sources.html) remains relevant regardless of a later runtime-agent decision.

## R4 — Keep operational records narrow; avoid creating a second history

### Cloud and release records

- Keep seven-day CloudWatch retention for sanitized controller/notification health records. Define allowed event fields such as component, fixed reason code, release identity and status; disallow user/peer/destination/question/URL/credential values.
- Review handler and framework errors, custom-resource logging, SNS text, EventBridge failure payloads, SQS dead letters and SSM command/output handling. Constrain event inputs to the fields actually needed; where automatic failed-request capture could retain prohibited fields, replace that path with a fixed-schema failure record while preserving alarms and failure status. Raw event forwarding and free-form exceptions must not bypass the schema. Do not suppress the failure itself.
- Keep CloudTrail's existing account-security purpose. Do not delete shared records or exclude events merely because the audit found documented partial STS credential responses. Restrict readers and avoid copying raw audit events into ordinary project diagnostics.
- Keep current release/lifecycle/rollback state and required image provenance. Prune retired-host probe/checkpoint history only after no active or recoverable operation references it. Do not TTL an active lock, rollout claim or required three-release history.
- Fail a privacy check if new flow/query logs, mirrors, traffic-bearing metrics or log exports appear unexpectedly. A provider API denial is unknown status, not absence.

### Debugging and local artifacts

For the first release, use synthetic isolated diagnostics and fixed production health codes. Defer a production verbose-debug feature until R2 establishes a suitable RAM sink; do not add an unqualified disk-backed “temporary” mode to ship the privacy fix.

If later needed, propose a default-off diagnostic session with a hard 15-minute deadline and a small fixed RAM capacity (initial proposal: 256 KiB per participating component, within the existing memory budget). New processes/boots return to normal mode. A lost CLI connection must not prolong the session. No automatic CloudWatch/S3 upload, no credential logging, and no user traffic logging by default even in debug mode. Export, if ever needed, requires an explicit separately scoped sanitized artifact.

Make profile/QR exports an intentional on-demand operator action, preserve installed profiles/Parameter Store, and review unnecessary duplicate exports, diagnostic archives and benchmark journals for deletion. First check whether credentials or useful recovery copies are unique. Keep real browsing URLs and complete configs out of ordinary evidence and agent conversations.

**Acceptance:** fixture errors and poison events cannot add prohibited fields to persistent diagnostics or dead letters; debug expiry/crash/reboot paths fail back to normal; local cleanup has a reviewed path-specific manifest and excludes active identities and unrelated applications.

## R5 — Release, prove the result and address existing traces

Use two deliverable boundaries: R1's early application fix, then the combined result after the R2/R3/R4 choices are implemented and qualified. Keep all changes on `feature/zero-logs`; the existing Git Spice relationship to `feature/tailscale` remains the intended stack. Git delivery is a separate instruction.

For each implementation release:

1. Run targeted configuration/error-path tests, then Node 24 `npm test`. Run the six-image package checks and central native qualification for the changed artifacts/platform. Use synthetic identities and fixed marker destinations.
2. Qualify once centrally, bind the evidence to the exact artifact/OS/template identities, and preserve the existing production-plus-three-history policy. Do not turn repeated protocol testing in every region into a new delivery gate.
3. Review a fresh CDK diff, preserved credential/EIP equality and current launch/lifecycle state. Use existing `active`/`manual`/`held` release controls if staged delivery is selected. Because publication is replicated and active controllers react automatically, review the publication/mode order before promising a single-region canary. Do not add per-region fallback pins or a second rollout mechanism.
4. Deploy through the existing headless blue-green host replacement/EIP handoff. Verify actual task/config policy, supported host evidence, selected telemetry state, endpoint/credential continuity and retirement of old hosts/disks. Keep Cape Town parked; verify its next launch uses the selected policy without waking it solely for this work.
5. Confirm both success and failure behavior under the claimed guarantee. Recheck client full-tunnel/fallback/DNS/IPv6 behavior in a separately scoped native test before broad tracking-resistance claims; this does not select a new client DNS architecture.

After new records are prevented, prepare a separate historical-cleanup manifest covering old host volumes/snapshots, retained groups/queues, exports/archives and known copied diagnostics. Use normal lifecycle ownership checks; preserve account CloudTrail, current credentials, required release provenance and other applications. Delete only reviewed items. Record metadata-only deletion/retention receipts. Historical logs can remain readable while the new design is correct, so report that interval explicitly.

Do not claim that unlinking a file, terminating a VM or expiring a log retracts provider copies or proves physical secure erasure. If actual reusable credentials are found exposed, handle rotation/device reenrolment as a separate incident response; the sampled STS fragments alone are not evidence requiring blanket credential rotation.

**Final acceptance:** a source-to-sink matrix accounts for each audit surface; synthetic marker tests substantiate the chosen persistence limits; all active deployments and parked launch templates match the selected policy; historical residue and unknown provider/device boundaries are explicitly listed. The report must state which of the two outcomes is achieved and which exceptions remain.

## Discussion decisions

1. **Scope of the guarantee:** selected starting level is no durable user-traffic records, with durable identity/recovery stores and sanitized account/infrastructure records explicitly retained. Improve the current foundation first, then evaluate stricter levels.
2. **AWS security tradeoff:** retain coverage in round one and evaluate the two features separately. No exclusion has been selected; any later proposal must state concrete privacy benefit, lost detection and residual AWS visibility.
3. **Platform constraint:** keep official Bottlerocket for round one. If a later, stricter RAM-only requirement is selected and supported interfaces cannot satisfy it, use R2 evidence to discuss the exact residual versus a platform/secret-delivery redesign.

The starting goal and flexible bottom-up approach are selected. This inventory supports the ongoing implementation discussion; security reductions, historical deletions and a platform redesign remain separate decisions. The known-leak fix need not wait for a maximal anonymity architecture.

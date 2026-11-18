# Quiet logging release — November 17, 2026

Historical six-image logging rollout receipt. Later DERP deployment and the qualified credential-delivery experiment are recorded in the [native trial closeout](native-credential-trial.md) and current regional launch records.

Release `sha256:a9ee9cfbc8a10b008e5e456d15f7713289def2184bd71e77de77f68c00d04cd7`, promotion `c660910d-017e-4dc6-83a3-be5b1eb84ca4`, published from Oregon. All four active regions run the exact centrally qualified six-image set on official Bottlerocket 1.66.0. Cape Town's retained intent is updated while it stays parked. [Counts-only evidence](evidence.json), [audit](../../../docs/logging-privacy-audit.md), [GuardDuty options](../../../docs/guardduty.md#privacy-control-granularity--november-17-review).

| Target | Region | Lifecycle | Current host | Slot |
| --- | --- | --- | --- | --- |
| stockholm-ecs | eu-north-1 | active | i-03dbda16cac462d4d | b |
| oregon | us-west-2 | active | i-071674c209c803d52 | b |
| zurich | eu-central-2 | active | i-0b19382d505f4b325 | b |
| cape-town | af-south-1 | parked | — | — |
| nva | us-east-1 | active | i-0118416c97626b88d | b |

## Verification

- Full Node 24 gate: 484 tests/75 files, typecheck, asset syntax/ShellCheck/Hadolint and fresh offline synthesis. Six ARM64 image/package checks pass with the recorded protocol versions.
- Disposable Ireland native proof: cold activation, full security/config hashes, both encrypted HTTPS clients, kernel lease timeout blocking/recovery, daemon hard-death ECS replacement without host/gateway turnover, ordered stop/start, native blue-green handoff, five-minute bake and source retirement. Final surviving-host clients and security verification pass. The supported producer generated `infra/platform-qualification.json`; #1059 remains an accepted OS limitation. Existing unchanged-controller fault evidence was reused; no new OS/controller fault campaign or repair is claimed.
- Production: eight encrypted protocol/region checks, four runtime verifiers and four bounded on-host log checks pass. All source hosts are terminated; each active region has one running host and exact release/image/OS readback. Diagnostic/admin containers are disabled and control is non-superpowered after every probe.
- All 35 production parameter version/timestamp records, ten endpoint allocation/IP fingerprints and five regional GuardDuty policies match the baseline. Native VPN remained visibly disconnected and fresh direct routes were checked immediately around real-client probes. Newly generated production test exports were removed; existing recovery files, installed profiles and Parameter Store identities were preserved.
- Current bounded samples contain zero recognized Xray access, DNS-question or credential-pattern records. Each initializer still has two nonempty secret bundles in XFS-backed Docker metadata. No raw lines, addresses, names, credential values or credential hashes enter this evidence.

## Related lifecycle correction

Publication protection was still present when optional pruning reached its pre-delete guard. Treating that safe stop as an interrupted operation retained an image-retention claim and blocked NVA. The CLI now defers/releases exclusion when publication changes before a deletion; actual uncertain AWS deletion failures still retain their owner. Four new regressions pass. Exact receipts were resumed, not stolen or cleared manually. The runtime build/native proof still matches because this is a CLI-only change. Every regional production/MRU window was verified coherent; no alias repair, new release or regional fallback history was invented. Final bounded cleanup removed 49 old unreferenced artifacts across five regions while preserving protected release/runtime dependencies.

## Cleanup and remaining boundaries

The isolated trial passed normal destroy and repeat-destroy. Independent readback finds no owned active stacks, hosts, disks, EIPs, VPCs, repositories, functions, tables, private parameters, log groups, queues, replication rules or exclusive asset bucket. Shared GuardDuty remains enabled; shared CloudTrail is preserved. 3 inactive trial task-definition deletions remain in AWS `DELETE_IN_PROGRESS`; no test credentials or compute remain.

This release removes the identified application traffic-recording paths. Persistent initializer metadata, broader host/dump/cloud-error paths, independent AWS telemetry and operator/device records remain separate remediation work. Later November 17 discussion selects Ghostline-host Runtime opt-out as the direction and requests a [concrete credential-delivery/removal plan](credential-delivery-plan.md); no exclusion is applied. Anthony chooses the credential root fix instead of temporary EBS data-volume scan exclusions. [Five-region metadata readback](privacy-settings.json) confirms the unchanged live settings and snapshot `NO_RETENTION`; scan-time copies still exist. The RAM mounts are already outside EBS scanning.

Ignored detailed operator receipts: `.local/zero-logs-release/`. No staging, commit, push, PR, public SSH opening or production security-group expansion occurred.

# Zurich fresh-install evidence

Active fresh-install testing target `zurich`, account `757999402784`, profile `personal`, region `eu-central-2`, AZ `eu-central-2a`. Endpoint stack `GhostlineZurich`, resource prefix `ghostline-zurich`; use the common [ECS gateway recipe](ecs.md). Oregon remains primary, Stockholm remains active for testing and Cape Town remains parked.

## Clean starting state — November 7, 2026

Initial live inventory found no active Ghostline stack, host, EIP or repository, but seven Standard SecureStrings, four log groups and one failure queue from September testing. Anthony explicitly requested purging Zurich. The normal `purge-region eu-central-2 plan` verified ownership and absence of live dependencies; the exact seven/four/one plan was reviewed before `execute`. Execution completed, and an independent subsequent plan reported zero parameters, logs, queues and task definitions with no live-resource blockers. Regional GuardDuty and independent shared account CloudTrail were retained. This is a fresh Ghostline infrastructure/identity installation, not first-time AWS region opt-in or account-security initialization.

Six independent server/device values were generated using existing helpers into protected ignored `.local/provision/zurich/`; the conflict-refusing importer created six Standard SecureStrings and verified all six. Historical local benchmark artifacts were not deleted or reused. Automatic approval review initially rejected copying the private alert email from Stockholm. Anthony explicitly approved it afterward; the copy then completed with SecureString equality verified and no value emitted.

## Fresh launch and validation — November 7, 2026

Standard `release activate zurich` recreated regional release infrastructure, seeded the existing production plus three prior releases, and enrolled Zurich in the six-member replication set. NVA/London remain retained publishers. Existing release infrastructure was reconciled through fresh diffs; no existing endpoint was redeployed. The first-launch lifecycle readback was `parked` without an operation, preserving the inactive-new-region invariant. No new image, protocol or OS selection was published.

Normal preflight verified the opted-in region, `t4g.small` offering and official regional ECS-3 ARM64 Bottlerocket 1.66.0 AMI `ami-07ad8e7f604a7db4b`. The reviewed endpoint diff created only `GhostlineZurich`. Standard `ecs zurich deploy` created the empty gateway first, then slot A networking/host, verified bootstrap and the cold daemon, and activated gateway revision 1. Final CloudFormation shared/host stacks are `UPDATE_COMPLETE`; one desired/running gateway task has zero pending and a completed deployment.

Current slot A host is `i-000ed93b44dcc8358`, ENI `eni-02a398a37eab12f6d`, one `t4g.small` running observed OS 1.66.0 with encrypted 2 GiB OS and 30 GiB data disks. Final release is ready on the unchanged qualified six-image document `sha256:0aca4d364d55bafd8ac093bc0169cbddceb9dc0f4d80c8f94a2778c903f37c9a`; all six observed image identities match the selected release. Lifecycle is `active` with no operation and no pending rollout.

| Protocol | EIP | Allocation | Slot A private address |
| --- | --- | --- | --- |
| Xray / REALITY | `51.96.162.8` | `eipalloc-01d8491cd274dda99` | `10.79.0.11` |
| AmneziaWG | `16.18.122.26` | `eipalloc-09fabefb0d2f0f0e2` | `10.79.0.10` |

GuardDuty reached HEALTHY for the exact new host, agent v1.17.3, within the normal deployment gate. Standard `ecs zurich verify` passed configuration hashes, native ARM64/SELinux, private read-only RAM, absent engine secret environments, bridge isolation, per-protocol EIP egress, no swap and enforced memory/no OOM. The verifier restored and verified administrative lockdown after its temporary diagnostic container. Existing protection was not reduced; the separate privacy/GuardDuty review is still open.

Immediately before `ecs zurich test`, OneXray's read-only UI and `scutil` showed disconnected, and the test IP/both endpoint routes used `en0`. Both disposable real encrypted clients completed certificate-validated HTTPS through their exact assigned EIPs without changing laptop routing. Twelve protected native profiles/URI/QR files were exported under ignored `.local/recovery/zurich-clients/`; directory 0700 and every file 0600. No native app import or connection was performed.

Independent before/after metadata comparisons confirm Oregon, Stockholm and Cape Town retain identical endpoint stack outputs/status, host IDs/states/launches, EIP allocation/association bindings, disks and all parameter metadata. Zurich has exactly one host, two encrypted disks and two EIPs; all seven fresh parameter metadata records are unchanged through activation/testing. The new alert email subscription is `PendingConfirmation`; owner confirmation remains necessary before email delivery is established.

The targeted configuration/lifecycle/activation gate passed 25 tests. Full Node 24 `npm test` passed twice, including after replication-membership enrollment: typecheck, asset syntax/ShellCheck/Hadolint, fresh four-region offline synthesis and 448 tests in 71 files. Existing advisory hardcoded-AZ warnings remain. Complete synthesized Oregon, Stockholm and Cape Town endpoint templates match their pre-change hashes, including embedded platform/user-data identities. `npm ci` reported seven existing dependency advisories; no dependency/lockfile changed. Runtime/image qualification was reused because those bytes did not change.

All three upstream watches were refreshed at closeout: Amnezia #2933, core-kit #1059/PR #1063 and Bottlerocket #4954 remain open, #1063 unmerged at `6a4c053`, and #4954 without comments. Latest releases remain Amnezia 5.1.0.6 and Bottlerocket v1.68.1; no new native-client repair, official bootstrap replay/recovery fix or IPv6 bridge support was qualified. Native-device practical use, destination access, matched speed, fresh device leak and sleep/wake results remain separate acceptance.

Ignored evidence: `.local/zurich-fresh-2026-11-07/{activate.log,endpoint-diff.log,deploy.log,client-test.log,security-verify.log,release-final.json,continuity.json,regional-final.json,final-test.log}`, the template hashes and original regional inventory checkpoints; `.local/region-purge/eu-central-2.json` is the pre-provisioning empty purge plan. Standard verification/coverage records are under `.local/deployments/zurich/ecs/`. Protected provisioning and exports are credential copies; no payload belongs in this document.

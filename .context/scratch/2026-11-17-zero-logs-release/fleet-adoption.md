# Credential-delivery fleet adoption

Completed November 18, 2026 (New York); authorized November 17. Production release `sha256:5e2731f3523b75340b39df164f714f1260dd2301c3aa293fb18ccf74ca741257`, promotion `e7e507a5-7bec-4703-bca4-7f5a21dae3a6`, published from Stockholm. **All four active shared gateways run the qualified direct-to-RAM credential-delivery recipe, including DERP/STUN.** Cape Town has the same ready retained selector/controller while staying parked. [Sanitized complete receipt](fleet-adoption.json), [final inventory](fleet-final-state.json), [continuity](fleet-continuity.json), [protected release window](fleet-protected-window.json).

## Delivery and acceptance

All five controllers were held manual before publication because the new initializer requires the updated task-role/network/task definition. The ordinary publisher exported exact qualified OCI bytes without rebuilding or changing protocol/OS selections. All five registries became coherent/ready. Fresh CDK diffs and the common native ECS blue-green path accepted Stockholm first, then Oregon/Zurich/NVA in parallel. Every rollout completed the direct EIP handoff, native bake and source-host/disk/network/temporary-address retirement with zero recorded health failures. All original active automation modes are restored and read back.

| Target | Slot | New host | Native / rollout | Encrypted VPNs | Tested persistent matches | GuardDuty |
| --- | --- | --- | --- | --- | --- | --- |
| stockholm-ecs | B | `i-0b7c601a8107dce14` | SUCCESSFUL / complete | 2 / 2 | 0 / 4 stores | HEALTHY v1.17.3 |
| oregon | B | `i-0f93572210ad24c2e` | SUCCESSFUL / complete | 2 / 2 | 0 / 4 stores | HEALTHY v1.17.3 |
| zurich | B | `i-0957beb757175e493` | SUCCESSFUL / complete | 2 / 2 | 0 / 4 stores | HEALTHY v1.17.3 |
| nva | B | `i-035e59d348346a321` | SUCCESSFUL / complete | 2 / 2 | 0 / 4 stores | HEALTHY v1.17.3 |
| cape-town | — | None, parked | Retained selector ready | Not run | No host to probe | Existing detector retained |

All four security verifiers pass unchanged configuration hashes/egress, private read-only RAM, UID/modes/SELinux/capabilities/seccomp/isolation, no host swap, enforced memory and no OOM. Each has fresh exact-host GuardDuty HEALTHY v1.17.3. Eight real existing-identity encrypted Xray/AWG clients pass HTTPS through the original endpoints. Four public pinned TLS/two-client DERP/STUN probes pass using the approved existing Oregon/NVA exits. Native macOS VPN status and actual routes were refreshed immediately before network probes; temporary profile exports, client containers and RAM volumes are removed. This does not add native-app, phone, censorship, IPv6 or uninterrupted-session acceptance.

Each native privacy probe compares nine protocol strings and three current temporary task-credential values against complete/stable/readable scans of Docker metadata, ECS checkpoint, containerd metadata and ECS logs. All four hosts have zero matches; all three initializer bundle fields are absent. DERP's three comparisons include its server key plus full/body representations of its TLS private key. Four engine namespaces per host time out to the real task credential endpoint; initializer authority is withdrawn after exit, and an offline missing-credential clone fails with fixed output without touching serving configuration. Diagnostics/admin disabled and control non-superpowered are read back after probes. No raw lines, client addresses, query names or credential values leave these probes.

## Final continuity and cleanup

Final metadata comparison preserves all **45 parameter metadata records**, ten original endpoint allocation/IP pairs and all gateway security groups. All five production selectors and original automation modes are coherent. Before/after GuardDuty foundational/feature settings, EBS scan criteria/preservation and shared CloudTrail configuration match in every maintained region. No rotation, device re-enrollment, monitoring exclusion or policy reduction occurred. Runtime opt-out remains separate.

Each active gateway has exactly one host/two encrypted attached disks and its original two endpoint addresses; Cape Town has zero host/disks. All native deployments are authoritatively SUCCESSFUL on the same accepted boot/instance, all rollout records are complete, and no trial/lifecycle/local-operation receipt remains. Publication protection is cleared; production plus three prior distinct releases are preserved. Independent primary-worktree Headscale resources are excluded by exact stack ownership and untouched.

## CLI throttle correction and verification

NVA's shared stack succeeded, but its post-CDK Lambda wake exhausted the SDK retries while the controller was busy. Three aggregate Lambda throttles are recorded in that minute. The persisted regional owner continued normally; native success, source cleanup and all independent acceptance checks passed without a second deployment or claim override. The [Invoke API](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html) classifies concurrency-limit rejection separately from executed function errors.

The CLI now retries only TooManyRequestsException from that wake, at most seven calls with bounded 1/2/4/8/10/10-second backoff. Deployment submission and handoff occur once; exhaustion/non-throttle errors still fail with ownership preserved. Eight focused tests and the full Node24 **523-test/85-file gate** pass, including typecheck, asset syntax/ShellCheck/Hadolint and fresh offline synth. This is CLI-only; all seven qualified ARM64 image inputs and native platform runtime bytes remain unchanged. The prior complete seven-image package/encrypted-traffic and central native recovery/reboot qualification remain valid; no delivery rebuild or protocol-version rediscovery occurred.

The required public upstream watches refreshed November 18 05:49 UTC remain open/unmerged: Amnezia #2933/latest 5.1.0.6; core-kit #1059/PR #1063 unmerged at 6a4c053; Bottlerocket #4954/latest 1.69.0. No official repair/IPv6 support or OS/client upgrade is claimed.

## Remaining boundary

The [closed native experiment](native-credential-trial.md) returned to its captured baseline before this separately authorized adoption. Current hosts avoid creating the tested plaintext disk copies, while Parameter Store intentionally retains identities and historical/provider copies are not erased or revoked. IAM authority remains shared across the task; verified engine network denial is not independent IAM isolation against a privileged host/kernel compromise. Broader cloud/error/journal/dump review, Runtime opt-out and foundational-flow/account-isolation decisions remain separate work.

Gateway deployments require the updated task recipe shipped with this release. Private operator logs and count-only receipts are under ignored `.local/zero-logs-fleet/`.

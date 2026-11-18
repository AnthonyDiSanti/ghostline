# DERP/STUN closeout — November 17, 2026 (New York)

The authorized existing-fleet milestone and final repository review are complete. Anthony subsequently authorizes the full-tree commit, merge into main, main push and return to `feature/tailscale` for next steps.

## Deployed state

Qualified promotion `dcbf284b-6892-45ad-a2d4-8704522209e6`, document `sha256:89ebce02a6f9ca9791fbba9213149573fc0766b9808ea70bef7affef97f052f2`, is ready in all five registries. Stockholm, Oregon, Zurich and NVA each observe all seven artifacts, completed native deployment/cleanup with zero health failures, one running host and two original EIPs. Cape Town remains parked with zero hosts/tasks. All original active controller modes are restored; no trial, lifecycle operation or local receipt remains.

- Stockholm: slot A `i-067dbe46fe520168f`, native success `2026-11-17T23:38:21.185Z`.
- Oregon: slot A `i-0f03f5dd29ff20e8d`, native success `2026-11-18T00:02:29.563Z`.
- Zurich: slot A `i-0c0e8edd4a979dad1`, native success `2026-11-18T00:02:35.244Z`.
- NVA: slot A `i-05773fa514d0e5141`, native success `2026-11-18T00:02:11.965Z`.

Final receipts: `final-fleet.json`, `final-continuity.json`, `final-release-acceptance.json`, `final-live-audit.json` in ignored `.local/derp-implementation-2026-11-17/`. Every region preserves all nine parameter metadata records, both allocation/IP pairs, security settings and original mode. No temporary maintained hosts/EIPs remain.

## Verification

Full Node 24 source gate: 502 tests/80 files, type/asset/synthesis checks, most recently `source-commit-review.log` after the trial preflight fix. Seven-image ARM64 gate passed at 20:34:49Z. Central proof at 23:18:17Z binds frozen platform bytes to ECS-3 ARM64 Bottlerocket 1.66.0; `qualified-derp.json` includes OS proof. Runtime bytes have not changed since capture.

All four regions pass native private RAM/confinement, pinned TLS/STUN, absent engine secret environments, memory/no OOM and fresh exact-host GuardDuty HEALTHY v1.17.3. Each original Xray/AWG client passes real encrypted HTTPS. Two upstream clients relay 1,024 bytes through every pinned public endpoint; STUN works and non-admitted TCP 443/internal 18443/UDP 3478 access is denied. Per-region `*-{deploy,verify,clients,public}-seven.log` and denial JSON hold metadata only. Probes sharing a regional AWG identity were serialized. Mac scutil/routes were freshly disconnected/en0; CUA window unavailable, no native VPN changed.

Stockholm trial `d7f11607-7176-407d-ad91-ff2b42d4c6c9` closed after acceptance. Ordinary stop deferred exit 3 while excluded. Trial deploy now checks bound production intent before mutation as well as afterward. No separate candidate image resolver/power environment exists.

## Native qualification and retirement

Ireland six-to-seven migration and automatic health-failure rollback pass. Corrected derper-only SIGSTOP with live health checks observed two failures and native ROLLBACK_SUCCESSFUL at 21:45:31Z; `qualification/native-rollback.json`. Dockerpause/operator rollback is separately archived and excluded from health qualification.

Seven-image power/park operations recover application/network transport. One stop/start lost exact GuardDuty coverage on `i-01626cfa36ceb0e25` despite enabled/running agent, host namespace, metadata HTTP 401 and telemetry DNS/TCP/TLS. Journal/file inspection found no error severity; timeout mentions were configuration. Association replay and one official-service restart did not restore coverage. Failed read-only qualification was archived without proof, its exact lifecycle CAS closed after lockdown verification, and normal park/unpark recovered fresh HEALTHY host `i-096a7fca978c10b9d`. Final native proof/public/client checks pass on that host. Reboot coverage root cause/repair remain unproven; no monitoring/IAM relaxation or runtime workaround.

Standard Ireland destroy completed with pending empty. Reviewed purge removed ten synthetic parameters, eight log groups and two queues; ten inactive task definitions remain in AWS DELETE_IN_PROGRESS. No runnable infrastructure remains, independent GuardDuty/CloudTrail survive, and both generated synthetic credential directories are removed. Keep metadata evidence; no repeat credential deletion needed.

## Scope and follow-ups

Headscale/map/admission and Tailscale exits are next. Fresh-region address-first DERP enrollment and explicit certificate reset after new allocations remain tracked onboarding work; the completed milestone covers existing retained endpoints. Coordinate certificate renewal/map-pin propagation before November 17, 2027. IPv6 and home concealment stay deferred. No native tailnet/Mac/iOS, seamless-session or zero-log/RAM-only guarantee is claimed.

The old NVA retention alert was already resolved at entry, before our rollout. No old retention receipt was resumed. Reviewed privacy runtime/tests and retention-publication deferral repair from untouched worktree t3-2adf5277 are preserved. Earlier quota/legacy/planning docs remain in full commit scope.

Use Node 24 `.local/node-v24.20.0-darwin-arm64/bin`, cache `/tmp/ghostline-npm-cache`; omit the two unsupported npm HTTP proxy duplicates. AWS profile personal/account 757999402784. Required upstream watches refreshed November 17: Amnezia #2933 open/latest 5.1.0.6; core-kit #1059 open/#1063 unmerged; Bottlerocket #4954 open/no engagement; latest Bottlerocket 1.69 unqualified. Keep the accepted 1.66 startup limitation.

Final repository gate passes: 134 changed/new files reviewed; 459 local links and 169 heading anchors resolve across 30 changed Markdown files; added/untracked payload-pattern and whitespace checks pass. Subsequent authorized Git preparation reruns targeted checks (18/4) and the full source gate (502/80); only documentation changes afterward. Whole-diff commit scope includes the reusable trial workflow, DERP/STUN, pre-existing quota/legacy/planning and imported privacy work. Preserve separate worktrees; return to this branch after pushing main.

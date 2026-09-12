# Stockholm ECS launch and primary cutover

Status: **Primary exit; cutover completed 2026-09-12.** Owner acceptance and unattended retained-IP lifecycle validation preceded retirement of the old Ubuntu Stockholm stack and EIPs. Cape Town is unchanged. The trial began on 2026-09-10; the sections below preserve chronological evidence. [Architecture and commands](ecs.md).

- Target `stockholm-ecs`, profile `personal`, account `757999402784`, region `eu-north-1`, AZ `eu-north-1a`.
- Endpoint stack `GhostlineEcsTrial`; durable image stack `GhostlineEcsTrialImages`.
- Stock AL2023 ECS x86_64 image `ami-0c020a23b5dfdbd1b`, AWS owner `591542846629`, release `al2023-ami-ecs-hvm-2023.0.20260901-kernel-6.1-x86_64`; ECS agent 1.106.2, Docker 25.0.16 per AWS release metadata.
- One t3.small, encrypted 30 GiB gp3, one ENI, two EIPs, separate Xray/AWG bridge tasks. No SSH key or inbound SSH.
- Six Stockholm credential parameters created and round-trip verified; keys/UUIDs preserved. No LastPass action or deletion of local recovery copies.
- Both immutable ECR releases published; offline topology/credential checks passed before launch.

Initial host `i-0cfa31a9139579f24`, ENI `eni-03a9220b5e86f3e26`.

| Protocol | Public address | Allocation | Private address |
| --- | --- | --- | --- |
| Xray | 51.20.163.146 | eipalloc-079db1eebf4b5cc78 | 10.79.0.11 |
| AWG | 16.16.73.146 | eipalloc-07627e295d844e8de | 10.79.0.10 |

Both ECS services reached steady state on the one AL2023 host. SSM verified configuration hashes match Parameter Store, read-only unprivileged bridge configuration, blocked IMDS and each container's assigned public egress. A disposable Xray client completed real HTTPS through the Xray EIP. Subsequent restoration and lifecycle results are recorded below.

The initial disposable AWG attempt had no handshake against either the ECS or unchanged Ubuntu Stockholm endpoint. Inspection found the Mac connected to the existing Xray VPN; this nested-tunnel path is a confounder. Repeat with the native VPN disconnected before attributing failure to ECS. No server tuning or security relaxation was applied.

The first park exposed a missing EC2→cluster dependency: cluster deletion raced a still-registered host. The host then terminated/deregistered and all other endpoint resources were removed. Cleaned up the empty trial cluster, added the dependency and a stopped-host deregistration preflight, with regression coverage. Both EIP allocations, ECR releases and parameters remained intact.

Retained-IP rebuild passed: new host `i-0da0f70b19c4a51d1`, ENI `eni-0ed168296680f7636`; both original trial allocations/public IPs survived. Both tasks restored automatically from ECR and Parameter Store, with matching configuration hashes and expected public egress. No SSH/install step was run. The deployed network helper matches the source prepared for commit.

With the native Xray VPN disconnected, disposable Xray and AWG clients each completed real HTTPS through their assigned EIP. The earlier AWG failure was confined to the nested Xray path; no protocol/configuration tuning was required. These are the 2026-09-10 agent-run isolated client checks; the owner confirmation below is separate evidence.

Stop passed: both services drained to zero; `i-0da0f70b19c4a51d1` reached stopped while retaining encrypted 30 GiB gp3 `vol-06ac4f02736c7b70d`, the ENI and both EIP allocations. Live volume/EIP tags match Project=ghostline, Environment=prod, System=shared/xray/amneziawg. Start passed: the same host/disk/ENI returned, both services stabilized at one task, both restored configuration/IMDS/egress checks passed, and both real client HTTPS/exit checks passed again.

2026-09-10 final infrastructure diff: no changes in endpoint or image stack. Full Node 24 gate: four offline targets and 95 tests pass. Git-visible live-credential scan, local documentation links and whitespace checks pass. The agent prepared native trial profiles without installing them during that session; files are under `.local/recovery/stockholm-ecs-clients/`. Existing Stockholm/Cape Town AWS resources remain unchanged.

On 2026-09-10, restored the original native Stockholm Xray selection after isolated tests. Amnezia showed Connected and an independent HTTPS check exits through `16.170.38.152`. The temporary watchdog process ended. No trial native profiles were installed or old profiles edited by the agent during that session.

## Owner acceptance — 2026-09-12

Anthony reported: “Both protocols are working,” then added: “I confirmed the IP masquerading as well.” Record this as owner acceptance of protocol connectivity and IP masquerading for the ECS bridge checkpoint. The report does not enumerate devices or separate DNS, IPv6, concurrency or performance subtests; do not infer those results. Existing Stockholm/Cape Town resources remain preserved until an explicit cutover/retirement instruction.

## Unattended lifecycle validation — 2026-09-12

Anthony requested this checkpoint before Stockholm cutover and explicitly excluded Cape Town. All mutations targeted `stockholm-ecs`; the older Stockholm `GhostlinePoc` stack/resources remained identical and its host remained running throughout the recorded comparisons. The Mac passed direct-internet checks before and after the run; final exit was `5.195.76.221`. The agent did not change native routes or profiles.

Corrected one automation gap before teardown: ECS deploy/publish inherited CDK's interactive IAM approval default. The explicit ECS command now disables that prompt after its fresh diff, retaining target/account/region checks. Global CDK settings, legacy commands, IAM policies and network controls did not change. Regression coverage guards ECS-only noninteractive scope.

| Sequence | Observed result |
| --- | --- |
| Running host → park → deploy | Passed with stdin closed. Removed host `i-0da0f70b19c4a51d1`, its disk, ENI and cluster; rebuilt as `i-0dd477fc361ee6ff1`. Both real protocol HTTPS/exit and server configuration/isolation checks passed. |
| Stop → start | Passed on `i-0dd477fc361ee6ff1`, preserving host, disk, ENI and both EIPs. Both services drained to zero and returned to one; server and real client checks passed. Stop took 39 seconds; start took 176 seconds, including EC2 health readiness. |
| Stop → park → deploy | Passed in one unattended sequence with all checks and stdin closed. Stopped-host park took 93 seconds; deploy took 285 seconds. The empty ECS registration/cluster, host, disk and ENI were removed without intervention, then replaced automatically. Both real protocol HTTPS/exit and server checks passed again. |

Both original allocations/public IPs and their tags survived both parking cycles. All six regional SecureString values and versions matched the baseline, as did published image tags/digests. Neither cycle imported credentials, published/rebuilt images, used SSH, installed runtime files manually, or required cleanup/repair between commands.

Final live state: host `i-0ccd265f182b32daf`, ENI `eni-07b6ab15aaa75d982`, encrypted 30 GiB disk `vol-05348498adf9b9730`. Both ECS services have desired/running count one and pending count zero. Xray remains `51.20.163.146`; AWG remains `16.16.73.146`. The prior two hosts/disks/ENIs are gone. Disposable test containers were removed.

Final CDK diff: no changes in endpoint or image stack. Full local gate: typecheck, four offline target synths and 96 tests pass. Task-local nonsecret snapshots, credential hashes and command logs are under `.local/diagnostics/stockholm-ecs-lifecycle-2026-09-12/`; plaintext credentials are excluded from those artifacts.

This closes the explicit stop/start and retained-IP cold-rebuild checkpoint. Full address release/new-profile behavior, idle expiration and a remote controller were not exercised or introduced. Existing native profiles retain the same endpoint/credential identities. Cutover/old-host retirement remains a separate instruction.

## Primary cutover and Mac profiles — 2026-09-12

Anthony explicitly authorized cutover and checking the previously installed Stockholm profiles. The Mac initially had the old Ubuntu endpoints only. Protected backups of both Amnezia preference domains were saved before changing profiles. Imported the generated ECS Mac profiles with preserved device credentials, then verified both through native Amnezia 5.0.1.5:

| Mac profile | Endpoint | Observed native result |
| --- | --- | --- |
| Ghostline Stockholm REALITY | `51.20.163.146:443` TCP | Connected; exact public exit and Wikipedia HTTPS 200 passed |
| Ghostline Stockholm AWG | `16.16.73.146:443` UDP | Version 3.1; three rounds passed all nine pings, direct DNS, Wikipedia HTTPS 200 and exact public exit |

The AWG test used the verified local daemon watchdog and unconditional disconnect cleanup. Direct egress returned to `5.195.76.221`; the timer ended. Both replacement profiles retain their familiar names; removed only the obsolete Stockholm entries from the application. Both Cape Town profiles remain intact. Final selection is Stockholm REALITY, **disconnected**. No persistent logging or client privacy-setting changes were made. These short tests do not establish sustained performance, IPv6 protection or iOS import.

`npm run destroy stockholm` completed unattended and released only the old stack's captured allocations. Verified `GhostlinePoc` is `DELETE_COMPLETE`, old host `i-033493f9d064f8b00` terminated, root disk `vol-00624392e421f4f1a` and ENI `eni-037352399599d6cc9` absent, and allocations `eipalloc-0849e55ead905822b` / `eipalloc-0c6fc191dc53dd019` released. The release record is `.local/deployments/stockholm/last-release.json`. No Cape Town AWS operations were targeted.

The active ECS stack outputs/resource identities, EIP associations/tags, ECR image digests and all six SecureString versions matched the pre-cutover baseline. The final secret audit read metadata only. Both services remain desired/running one, pending zero, on `i-0ccd265f182b32daf`; the ECS EIPs were kept rather than reassociating the old addresses. Post-retirement runtime configuration/isolation/egress verification and disposable encrypted HTTPS tests passed for both protocols. Final endpoint/image CDK diff: no changes. Full local gate: typecheck, four offline synths and 96 tests passed.

Evidence and protected local preference backups are under `.local/diagnostics/stockholm-cutover-2026-09-12/`. Local credentials/recovery copies remain; Anthony intermediates LastPass saves. Current iOS exports are `.local/recovery/stockholm-ecs-clients/ios-{xray,awg}.vpn` and `ios-{xray,awg}-qr.png`. Any phone profile still using `16.170.38.152` or `13.50.178.121` must be replaced with these exports; no iOS profile change was performed during this cutover.

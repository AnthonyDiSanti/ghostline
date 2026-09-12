# Stockholm ECS trial — 2026-09-10

Status: ECS bridge checkpoint accepted. Anthony confirmed connectivity through both protocols and IP masquerading on 2026-09-12, then requested commit prep. Cutover remains separate. This independent target does not replace the existing Stockholm or Cape Town host yet. [Architecture and commands](ecs.md).

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

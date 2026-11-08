# Ghostline regional inventory

## Latest November 8 — NVA maintained and validated

Anthony requests NVA again as an additional maintained proximity endpoint. Normal target `nva` / `GhostlineNva` / `ghostline-nva` is active with independent identities: host `i-0d404aca56acb51dd`, REALITY `32.193.23.120`, AWG `184.196.132.0`, two encrypted disks/two EIPs, seven parameters and a ready qualified release. Full host/security and isolated/native protocol checks pass; GuardDuty is HEALTHY v1.17.3. Both native apps are saved and disconnected with original routing restored. Five-member mesh includes maintained NVA without retained-publisher status; Oregon remains primary. Four existing exits and independent security snapshots are exactly unchanged. Old disposable fresh-trial task definitions are now absent across all statuses. London stays retired. Do not run regional purge against maintained NVA. [Launch record](../../docs/launch-nva.md).

## November 8 — publisher retirement and accepted fresh NVA trial cleanup

The old NVA trial and both NVA/London publisher stacks/images/support were fully retired before a genuinely fresh NVA install. The fresh initializer created independent identities; normal deployment, host/security and both encrypted-client HTTPS gates passed. Anthony completed Amnezia import as `Server 1`, validated native AWG then disconnected, and also validated OneXray REALITY.

The agreed post-acceptance full destroy is complete with pending empty: fresh host/disks/EIPs/stacks/repositories removed and NVA publication membership retired. Reviewed purge removed all seven new parameters, four logs and one queue. At that cleanup checkpoint, two task definitions remained in `DELETE_IN_PROGRESS`. They subsequently disappeared; the latest scoped all-status read finds zero old fresh-trial records. NVA is now maintained again as described above. London final inventory remains empty. Four maintained exits and NVA/London GuardDuty/shared CloudTrail snapshots are exactly unchanged. No permanently retained publisher regions/defaults remain. Local NVA profiles/exports are outside cloud cleanup and now refer to retired endpoints. [Evidence and residual follow-up](../scratch/2026-11-08-region-retirement/validation.md).

## November 7, 2026 — fresh Zurich preparation

Source: direct AWS metadata APIs in account `757999402784`, profile `personal`, across all 34 enabled commercial regions. Evidence/checkpoints are ignored `.local/zurich-fresh-2026-11-07/account-inventory-before.json` and `inventory-<region>.json`. Thirty-three regions completed without service-query errors; Bahrain (`me-south-1`) timed out for all queried services and remains unknown. Do not report it as empty. The first scan was stopped after an excessively slow API wait; the completed replacement uses explicit timeouts, single attempts and durable per-region checkpoints.

Scope: live CloudFormation stacks with Ghostline names, Project=ghostline EC2 hosts/EIPs/VPCs/EBS, Ghostline ECR repositories, `/ghostline/` parameter metadata, Ghostline-named log groups/queues/ECS clusters/task definitions (all three statuses), and regional detector presence. No parameter values, log events, queue messages or task-definition payloads were read by the inventory. This is an application-region inventory, not an audit of every account resource, untagged orphan, service-held security record or separate AWS partition.

| Region | Observed Ghostline state |
| --- | --- |
| Oregon `us-west-2` | Active maintained gateway: one host, two encrypted volumes, two EIPs, one VPC/cluster, four stacks, seven repositories, seven parameters. |
| Stockholm `eu-north-1` | Active maintained testing gateway: same resource counts as Oregon; historical inactive task revisions also remain. |
| Cape Town `af-south-1` | Parked: no host/volumes/VPC/cluster, two retained EIPs, three stacks, seven repositories, seven parameters. |
| Northern Virginia `us-east-1` | Scan baseline: intentional retained publisher, one release stack/seven repositories and no gateway. The first initializer trial and this publisher were subsequently retired; see November 8 above. |
| London `eu-west-2` | Intentional retained publisher: same publisher-only resource counts as Northern Virginia. |
| Frankfurt `eu-central-1` | Retired-test residue: seven parameters (six credentials plus alert contact), thirteen log groups, three queues. No live stack, host, EIP, repository or ECS cluster/task definition. |
| Milan `eu-south-1` | Retired-test residue: seven parameters, four log groups, one queue. No live stack, host, EIP, repository or ECS cluster/task definition. |
| Mumbai `ap-south-1` | Three historical benchmark log groups only among queried Ghostline application resources. |
| Hyderabad `ap-south-2` | One historical benchmark log group only among queried Ghostline application resources. |
| Zurich `eu-central-2` | Owner-authorized purge removed seven parameters, four log groups and one queue; fresh empty plan verified zero. This scan ran afterward and observed six newly imported independent credentials, with no fresh release/endpoint stacks, host or EIPs yet. See the evolving [launch record](../../docs/launch-zurich.md). |
| Bahrain `me-south-1` | Unknown: all fourteen service queries timed out. |

The other 23 queried regions returned no matching application resources in scope. Regional GuardDuty and the shared account CloudTrail are independent controls, not VPN exits; retained security coverage is excluded from the empty-application claim. At this November 7 scan, only Zurich deletion was authorized and performed. Frankfurt/Milan/Mumbai/Hyderabad cleanup requires its own scope and reviewed plans. The former Northern Virginia/London retention was explicitly superseded by the November 8 owner decision above.

Use this note when answering which regions remain, deciding cleanup scope, or interpreting “fresh.” Region opt-in, GuardDuty and account audit existed before the Zurich application/identity reset; this launch does not test first-time AWS account initialization.

Later November 7 follow-up: Zurich fresh deployment completed with one host, two encrypted disks, two EIPs, seven fresh parameters and ready qualified release. GuardDuty/host audit and both real encrypted clients passed. Existing-exit continuity is unchanged. The table above remains the dated pre-host inventory snapshot; consult the launch record for current Zurich state.

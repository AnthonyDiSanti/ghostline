# Whole-stack regional releases

The [handoff](../.context/handoff.md) and regional launch records contain observed deployment identities. Qualification, publication, deployment and verification remain separate evidence boundaries.

The common pipeline qualifies bootstrap, network-daemon, gateway-config, Xray and AWG centrally. Publication exports those exact OCI bytes and uses the same bounded, checksummed ECR transfer as regional seeding. Delivery never rebuilds images or retests protocols as a release gate. Lambda code remains a CDK asset.

CDK owns the shared gateway task definition and each host slot’s daemon task definition and static local `:keep-production` image references, plus Bottlerocket's static bootstrap source. Publication owns aliases and rollout intent. The controller does not register or select task definitions and cannot write registry images. IAM denies registration; its service-scoped `UpdateService` permission also permits selecting an existing definition, so static selection is enforced by the implementation and monitored by the audit rule, not by a force-only IAM action.

## Ownership and distribution

`deployment.json.imagePublication` records `members`, `retainedMembers` and `automation`. Each enrolled member can originate a release and replicates directly to every other member. NVA and London remain enrolled and explicitly retained. Select an enrolled target or region for publication; one operator publishes at a time. This is not a distributed consensus system.

`GhostlineRelease` owns six repositories under `ghostline/prod/`: `bootstrap`, `network-daemon`, `gateway-config`, `xray`, `awg`, and `releases`. Gateway regions also have one serialized controller, a thin ECS hook receiver, an on-demand DynamoDB table, ECR/hourly/continuation rules, alerts and expiring logs/dead letters. Publisher-only regions have repositories only. `GhostlineReleaseAssets` owns the private regional Lambda and immutable host-template asset bucket. Cost tags preserve Project, Environment and resource-owned System.

The registry API replaces a regional replication document. Reconciliation changes only our exact `ghostline/prod/` prefix and preserves unrelated rules. It visits the union of old/new membership and reads back every change; an unreachable former origin is pending cleanup. Overlapping foreign rules require ownership review. ECR does not backfill old images, replicate deletes, or forward replicated arrivals for a second hop. Activation explicitly seeds the protected release window before enabling outbound membership. [AWS replication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html).

## Authoritative document and tags

A non-runnable OCI artifact in **`ghostline/prod/releases`** records schema/promotion identity, exact root and ARM64 runtime digests for all five images, build tags, OS variant/architecture/compatible versions and exact centrally qualified target version, and up to three prior distinct whole-stack release documents. It contains no regional AMI ID. An optional `sourceApplicationRelease` records provenance when migrating previously qualified application releases into the complete schema; it does not claim that composed historical sets previously ran.

New publications use schema v3; v2 documents remain readable as retained history but require requalification before republication. The JSON is a layer and a manifest annotation whose hash and byte count must agree. The controller needs manifest-read authority only. No OCI subject relationship ties documents to initializer lifetime.

| Tag | Meaning |
| --- | --- |
| `keep-production` | Intended image in each of five runnable repositories |
| `keep-production-release` | Authoritative intended complete set in `releases` |
| `keep-mru-1` through `keep-mru-3` | Images of the three prior distinct complete releases |
| `keep-mru-N-release` | Corresponding protected documents |
| `sha-…`, `release-<promotion-id>` | Immutable content/publication identities |
| `keep-publishing`, `keep-publishing-release` | Temporary protection during resumable alias rotation |

History is application-level promotion history; regional outcomes never reorder it. Runtime child digests and the OS contract determine meaningful equality, so a provenance-only index change does not consume a history slot or restart tasks. Changed qualification limitations still publish a new document without retaining a duplicate runtime set. Publication verifies all descriptors, rotates complete sets oldest-first, and moves the production document selector **last**. Interrupted rotation resumes from the same immutable document. Every deliberate regional effect rechecks local descriptor availability and exact production-alias/root equality.

The accepted short race between alias validation and ECS resolution remains. Version consistency is explicitly enabled for every ECS container. The controller verifies what actually ran instead of treating current tags as deployment evidence.

## Retention

Keep production plus three prior **distinct** releases, their documents and every referenced component, including shared platform versions. Native lifecycle rules protect keep aliases and expire untagged leftovers after seven days; referenced index children remain protected by ECR. Tagged garbage collection is bounded operator work because native ECR rules cannot see a lagging or parked host.

Before deleting old tagged candidates, the operator holds regional lifecycle exclusion, reads the protected history and actual bootstrapped/running digests, protects both held/overlapping generations and their intended document, checks fresh active host/task evidence or retained stopped/parked observations, and expands index children. Missing observations defer cleanup. The `runtime/images` record preserves the five last-verified digests independently of host-slot identity, including after park removes the host. Status commands label these retained images separately from live generation evidence. Each deletion rechecks publication intent and keep aliases. Candidates must be older than seven days; at most twenty are removed per pass, parents before unreferenced children. This protects actual recovery dependencies without creating regional MRU histories or fallback pins.

Deletes do not replicate. Completed temporary publication aliases and obsolete MRU slots must be cleared at each destination only after its full replacement window is present. This also reconciles a shortened history: tag deletions at the origin do not remove destination aliases. The Lambda has no cleanup/image-write authority. [ECR lifecycle semantics](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html).

## Regional state machine

Successful owned pushes/replications, explicit CloudTrail PutImage writes, deployment-completion events and hourly reconciliation invoke one Lambda with reserved concurrency one. ECR reads cannot trigger the handler: both rules and an early queued-event filter reject them. ECS calls a separate receiver with capacity for concurrent callbacks. It has only permission to invoke the controller; controller throttling returns IN_PROGRESS instead of triggering ECS failure. All state and infrastructure changes remain serialized in the controller. A minute schedule is enabled only to continue a pending accepted action or asynchronous host observation; it is disabled when idle, deferred or paused.

Conditional DynamoDB records serialize the controller with CLI deploy/start/stop/park/destroy, support-stack deployment and image cleanup. A killed operation retains its ownership token. Persist uncertain launch intent before issuing it; continue bounded observations across invocations. Concurrency one alone is not the exclusion mechanism.

Shared regional infrastructure owns the VPC, cluster, task, roles and production EIPs. Two reusable slot stacks own each slot's ENI, host and placement-constrained daemon. Slots transition through absent, network-only and running; a separate temporary-address stack preserves either host's management connectivity during the swap. Only one host remains after success.

1. Prepare green's network and temporary EIPs, launch the exact qualified OS, and verify its current bootstrap identity and healthy cold daemon.
2. Select green for new gateway placement and request one native headless ECS BLUE_GREEN deployment. Initializer SUCCESS still gates both engines.
3. Direct blocking hooks verify actual task digests, native service-revision identity and both daemon-validated engines. The parameterless observer reads only nonsecret boot/OS/settings and loopback daemon readiness.
4. At PRODUCTION_TRAFFIC_SHIFT, reconcile each production EIP onto green and each displaced temporary EIP onto blue. Journal direction and read back every binding; move the primary management address last. Existing VPN connections may reconnect; this is not session-state migration.
5. During the five-minute native bake, observe green. Two spaced verified failures or a bounded deadline request one ECS rollback, only when blue is verified healthy. ECS owns deployment success/rollback; reversed hook weights authorize return of both EIPs. There is no MRU fallback cascade.
6. After authoritative success, drain blue, observe actual task termination, remove the host, detach temporary addresses, remove its ENI and release temporary allocations. For an already-stopped host, its disconnected ECS agent can leave stale task statuses; retirement instead requires zero registered running/pending counts, explicit non-forced deregistration and a fresh stopped-host/absent-registration observation. Failure keeps green for explicit diagnosis/cleanup and blocks another rollout; daily notifications report retained costs.

No meaningful runtime/OS/template change means no restart. Every meaningful change uses this one rollout path; there are no separate in-place bootstrap/app/daemon policies. Preparation phases are bounded at 30 minutes and an EIP handoff at five minutes. Missing health evidence does not authorize failback. Failed or uncertain destructive actions pause rather than repeating indefinitely.

CLI infrastructure changes prepare green under the same lock before CloudFormation can launch a new task revision, then transfer ownership directly to the controller. Initial deployment creates an empty gateway first, wires management EIPs, verifies bootstrap/daemon readiness and starts the app. Stop/park preserve inactive intent; image arrivals cannot wake hosts. Explicit cleanup may remove failed green while verified blue remains stopped, provided both production EIPs still belong to blue. Park removes both generations and retires the old rollout record.

Unexpected native recovery never waits for this metadata or controller. Essential bootstrap isolation still gates workloads; incomplete observations are reported afterward. An ECR pull failure is a distinct dependency: the qualified Bottlerocket version did not recover from a cached bootstrap alone. [Platform and OS policy](platform.md).

## Controller authority and audit

The controller can update the exact regional services, change cluster placement/draining, non-forcibly deregister a verified stopped/disconnected empty host, observe and stop the exact native deployment, and reassociate only owned EIPs/ENIs. It can submit only the immutable CDK host/address templates with one exact CloudFormation service role. That role provisions only the owned slots using the shared subnet/security group and narrowly scoped host/execution roles. Lambda has no direct RunInstances, RegisterTaskDefinition, reboot, application-parameter reads, IAM editing or arbitrary host-command authority.

SSM SendCommand is limited to the fixed read-only observer document and exact stack-tagged host. AWS does not support resource scoping for GetCommandInvocation; this residual permission can read another known command ID, so do not claim perfect command-output isolation. No command listing or document editing is granted. See [SSM authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html).

Regional default-bus audit rules detect task-definition registration and task-selection changes for both services. They require an active management-write trail. Deployment ensures the independent [account CloudTrail baseline](cloudtrail.md); Event History alone is insufficient. App teardown never disables/deletes shared audit or GuardDuty.

## Commands

From `infra/`, using Node 24:

```sh
npm run images:build
npm run release publish us-east-1
npm run release status stockholm-ecs
npm run release reconcile stockholm-ecs
npm run release cleanup-failed stockholm-ecs
npm run release retry stockholm-ecs
npm run release publish eu-west-2 sha256:<retained-document-digest>
npm run release activate <target>
```

Build qualifies once. A changed platform also needs the documented central native experiment and `platform <target> qualify <qualified-file>` before production publication. `reconcile` observes intended state; `cleanup-failed` removes the failed slot after safe return to blue (or explicit stopped-state proof); `retry` explicitly permits another attempt after cleanup. Retaining the host does not guarantee ECS preserves failed tasks or RAM. A retained release promotion is a new global intent, not a regional tag rewrite.

Stop/park retain membership and release support. Destroy retires incoming/outgoing membership, deletes local images/support/nonexpiring state, and releases owned addresses. Standard parameters, expiring logs and independent security persist. NVA/London are protected from destroy. [Complete lifecycle](deployment-lifecycle.md).

## September 28 blue-green qualification and migration

Headless ECS hooks, five-minute bake, task-loss/partial-EIP/whole-host-stop rollback and explicit failed-green cleanup passed in isolated Ireland. Stop/start, park/unpark, unchanged deployment and full destroy/repeat/redeploy also passed. Stockholm's original resources were retained/imported without host/task/boot/IP turnover before its first native rollout. Cape Town adopted the same architecture while remaining parked.

A second centrally qualified release corrected native diagnostics to identify either exact daemon slot family. Publication `825ab64d-1b91-4817-b859-fbac1b502002` selects v3 document `sha256:09053dfcd46a0fd0fadf967df59fd3bf0fe9e5bdf9383c17a69ac3ed207a8f77` in all four registries. ECR arrival automatically initiated Stockholm's second rollout; native ECS success followed its five-minute bake. See the [Stockholm launch record](launch-stockholm-ecs.md) and [handoff](../.context/handoff.md) for completed source cleanup and the October 1 production security verification/diagnostic lockdown. Ireland is fully removed except deliberate retained credentials, expiring data and independent security controls.

The final source gate passes 396 tests/67 files, typecheck, fixture checks and fresh offline synthesis. Real encrypted clients exercise handoff/recovery; this does not promise seamless sessions or new iOS acceptance. Scheduled discovery/build/qualification of upstream security updates remains a separate work item; delivery of already-qualified releases is automated.

## September 26 migration evidence

All four members select v2 document `sha256:013a8b63b7e93b25312ea3d296ec6378ccd6e13c3c4be91baf8439be56ed8d07`. Cape Town then Stockholm passed retained-IP cold rebuild, credential continuity, runtime security/GuardDuty and both encrypted client checks. Their controllers are enabled; obsolete coupled-helper stacks/repositories and initializer-repository release aliases are removed. The dedicated metadata repository owns release history.

The pre-migration protected window held three v1 documents but only two distinct executable sets after provenance-wrapper deduplication. Migration preserved those identities and selects production plus one distinct prior set; retention capacity remains production plus three distinct priors. This does not manufacture additional history or claim historical composed platform sets previously ran. A same-digest ECR replication/PutImage race was observed during promotion: the adapter accepts the duplicate only after exact tag-digest readback, and interrupted publication resumed successfully.

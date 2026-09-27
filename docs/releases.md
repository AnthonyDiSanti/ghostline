# Whole-stack regional releases

Stockholm and Cape Town use this whole-stack release contract. The [handoff](../.context/handoff.md) and regional launch records contain observed deployment identities. Qualification, publication, deployment and verification remain separate evidence boundaries.

The common pipeline qualifies bootstrap, network-daemon, gateway-config, Xray and AWG centrally. Publication exports those exact OCI bytes and uses the same bounded, checksummed ECR transfer as regional seeding. Delivery never rebuilds images or retests protocols as a release gate. Lambda code remains a CDK asset.

CDK owns the two task definitions and static local `:keep-production` image references, plus Bottlerocket's static bootstrap source. Publication owns aliases and rollout intent. The controller cannot register/select task definitions or write registry images.

## Ownership and distribution

`deployment.json.imagePublication` records `members`, `retainedMembers` and `automation`. Each enrolled member can originate a release and replicates directly to every other member. NVA and London remain enrolled and explicitly retained. Select an enrolled target or region for publication; one operator publishes at a time. This is not a distributed consensus system.

`GhostlineRelease` owns six repositories under `ghostline/prod/`: `bootstrap`, `network-daemon`, `gateway-config`, `xray`, `awg`, and `releases`. Gateway regions also have one controller, an on-demand DynamoDB table, ECR/hourly/continuation rules, alerts and expiring logs/dead letters. Publisher-only regions have repositories only. `GhostlineReleaseAssets` owns the private regional Lambda asset bucket. Cost tags preserve Project, Environment and resource-owned System.

The registry API replaces a regional replication document. Reconciliation changes only our exact `ghostline/prod/` prefix and preserves unrelated rules. It visits the union of old/new membership and reads back every change; an unreachable former origin is pending cleanup. Overlapping foreign rules require ownership review. ECR does not backfill old images, replicate deletes, or forward replicated arrivals for a second hop. Activation explicitly seeds the protected release window before enabling outbound membership. [AWS replication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html).

## Authoritative document and tags

A non-runnable OCI artifact in **`ghostline/prod/releases`** records schema/promotion identity, exact root and ARM64 runtime digests for all five images, build tags, OS variant/architecture/compatible versions, and up to three prior distinct whole-stack release documents. It contains no regional AMI ID. An optional `sourceApplicationRelease` records provenance when migrating previously qualified application releases into the complete schema; it does not claim that composed historical sets previously ran.

The JSON is a layer and a manifest annotation whose hash and byte count must agree. The controller needs manifest-read authority only. No OCI subject relationship ties documents to initializer lifetime.

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

Before deleting old tagged candidates, the operator holds regional lifecycle exclusion, reads the protected history and actual bootstrapped/running digests, checks fresh active service observations or retained stopped/parked observations, and expands index children. Missing observations defer cleanup. Each deletion rechecks publication intent and keep aliases. Candidates must be older than seven days; at most twenty are removed per pass, parents before unreferenced children. This protects actual recovery dependencies without creating regional MRU histories or fallback pins.

Deletes do not replicate. Completed temporary publication aliases and obsolete MRU slots must be cleared at each destination only after its full replacement window is present. This also reconciles a shortened history: tag deletions at the origin do not remove destination aliases. The Lambda has no cleanup/image-write authority. [ECR lifecycle semantics](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html).

## Regional state machine

Successful owned pushes/replications, explicit CloudTrail PutImage writes, deployment-completion events and hourly reconciliation invoke one Lambda with reserved concurrency one. ECR reads cannot trigger the handler: both rules and an early queued-event filter reject them. A minute schedule is enabled only to continue a pending accepted action or asynchronous host observation; it is disabled when idle, deferred or paused.

Conditional DynamoDB records serialize the controller with CLI deploy/start/stop/park/destroy, OS update, support-stack deployment and image cleanup. A killed operation retains its ownership token. Persist each effect before issuing it, observe uncertain acknowledgements, and bound waits across invocations. Concurrency one alone is not the exclusion mechanism.

The controller reads actual ECS task digests, the current kernel boot ID and bootstrap record, and actual OS identity. ECS registration attributes alone can be stale after reboot. A parameterless SSM document reads only nonsecret native OS/boot/settings metadata.

| Meaningful change | Action |
| --- | --- |
| None, duplicate or out-of-order event | No restart/reboot |
| Initializer or engine only | One gateway force deployment |
| Daemon only | Non-overlapping DAEMON replacement; wait for health; preserve app task/host |
| Bootstrap | Quiesce gateway, drain daemon, reboot once, observe bootstrap/OS/agent, activate daemon, restore app |
| Combined components | One strongest action; force changed daemon/app only when necessary |
| Parked/stopped/destroying | Preserve power intent; do not wake the host |
| Controlled bootstrap startup timeout | One temporary recovery reboot only under the [platform exception](platform.md#temporary-controlled-boot-recovery); then pause on failure |
| Other failed, rolled-back or uncertain actions | Record/alert/pause; do not repeat destructive effects automatically |

An unchanged app is restored after bootstrap reboot with desiredCount alone; forcing deployment at the same time as 0→1 caused two sequential app tasks in a native ECS trial. Changed app/daemon components resolve the new aliases through their explicit deployment. Native ECS rollback remains enabled where supported. There is no custom multi-release fallback cascade; retry/corrected publication follows investigation.

Unexpected native recovery never waits for this metadata or controller. Essential bootstrap isolation still gates workloads; incomplete observations are reported afterward. An ECR pull failure is a distinct dependency: the qualified Bottlerocket version did not recover from a cached bootstrap alone. [Platform and OS policy](platform.md).

## Controller authority and audit

The controller can update only the regional gateway/daemon services; drain/reactivate only the cluster's container instances; and reboot only hosts bearing the exact project/environment/CloudFormation-stack ownership tags. Code rechecks the physical stack-owned instance immediately before each effect. It cannot register task definitions, stop/start EC2, update CloudFormation, read application parameters, change IAM, or run arbitrary SSM documents.

SSM SendCommand is limited to the fixed read-only observer document and exact stack-tagged host. AWS does not support resource scoping for GetCommandInvocation; this residual permission can read another known command ID, so do not claim perfect command-output isolation. No command listing or document editing is granted. See [SSM authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html).

Regional default-bus audit rules detect task-definition registration and task-selection changes for both services. They require an active management-write trail. Deployment ensures the independent [account CloudTrail baseline](cloudtrail.md); Event History alone is insufficient. App teardown never disables/deletes shared audit or GuardDuty.

## Commands

From `infra/`, using Node 24:

```sh
npm run images:build
npm run release publish us-east-1
npm run release status stockholm-ecs
npm run release reconcile stockholm-ecs
npm run release retry stockholm-ecs
npm run release publish eu-west-2 sha256:<retained-document-digest>
npm run release activate <target>
```

Build qualifies once. A changed platform also needs the documented central native experiment and `platform <target> qualify <qualified-file>` before production publication. `reconcile` observes intended state; `retry` is an explicit correction after inspecting paused/failed work. A retained release promotion is a new global intent, not a regional tag rewrite.

Stop/park retain membership and release support. Destroy retires incoming/outgoing membership, deletes local images/support/nonexpiring state, and releases owned addresses. Standard parameters, expiring logs and independent security persist. NVA/London are protected from destroy. [Complete lifecycle](deployment-lifecycle.md).

## September 26 migration evidence

All four members select v2 document `sha256:013a8b63b7e93b25312ea3d296ec6378ccd6e13c3c4be91baf8439be56ed8d07`. Cape Town then Stockholm passed retained-IP cold rebuild, credential continuity, runtime security/GuardDuty and both encrypted client checks. Their controllers are enabled; obsolete coupled-helper stacks/repositories and initializer-repository release aliases are removed. The dedicated metadata repository owns release history.

The pre-migration protected window held three v1 documents but only two distinct executable sets after provenance-wrapper deduplication. Migration preserved those identities and selects production plus one distinct prior set; retention capacity remains production plus three distinct priors. This does not manufacture additional history or claim historical composed platform sets previously ran. A same-digest ECR replication/PutImage race was observed during promotion: the adapter accepts the duplicate only after exact tag-digest readback, and interrupted publication resumed successfully.

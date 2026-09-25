# Event-driven regional releases

Current implementation and operator contract: [release workflow](../../docs/releases.md). Selected by Anthony, September 21, 2026. Cloud migration/evidence belongs in the handoff and launch records; this note retains reusable AWS findings and rationale.

## Selected release contract

- September 22 supersession: any-member direct replication with explicit retained NVA/London members; union-based retirement and historical seeding. Local implementation is in progress; see the handoff for cloud state.
- Central qualification once. Distribution validates identity/completeness, without rebuilding or re-testing protocols.
- Static local `keep-production` image references owned by CDK. The release artifact lives beside the initializer under `keep-production-release`; SHA256 manifest identities already exist in ECR.
- One regional gate, reserved concurrency one, ECR wakeups and hourly reconciliation. Minimal conditional attempt state, independent destination progress and explicit retry; no task-definition registration/selection or desired-count mutation by the gate.
- Native ECS circuit breaker/whole-revision rollback. Accept the final validation-to-ECS-resolution tag race. No distributed tag lock or custom MRU recovery cascade.
- One app-level production + three prior distinct releases, with regionless image/document aliases. **Fixed history wins over preserving an old regional native rollback set.** Anthony explicitly rejected extra regional pins; stale regions should alert and be debugged.
- Reusable SNS package with private regional email parameters. Personal-assistant adoption is a separate follow-up after its GuardDuty correction.

## Verified AWS behavior

ECR replication is one-hop and copies only content pushed/restored after configuration. Names must match; no tag-level replication filter or retroactive backfill API exists. Source retagging is `PutImage`, not resource `TagResource`; replicated deletions and lifecycle policies are not supported. Both publishers target every subscriber directly and a new region is explicitly seeded. Preserve unrelated registry rules because `PutReplicationConfiguration` replaces a singleton document. [Replication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html), [retagging](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-retag.html), [registry configuration](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_PutReplicationConfiguration.html).

ECR notifications are best-effort. A schedule can repair missed wakeups but does not transfer missing bytes. EventBridge global endpoints route custom ingestion, not all native ECR events; regional rules avoid a global event-bus dependency. Source/DR outage does not affect completed local copies or existing tasks. [Delivery](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-ecr.html), [native events](https://docs.aws.amazon.com/AmazonECR/latest/userguide/ecr-eventbridge.html), [global endpoints](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-global-endpoints.html).

ECS image version consistency captures image digests per deployment. Explicit `enabled` avoids silent reliance on defaults. It is not a transaction across three tags and does not version secret parameters. `UpdateService` has no complete IAM force-only field restriction: restrict its service resource, omit task-definition/PassRole authority, and test the request shape. [Resolution](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html), [UpdateService](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_UpdateService.html).

## Rollback configuration and retention boundary

Enable native circuit breaker/rollback with the existing minimum healthy zero / maximum 100 service configuration. Fixed host ports prevent overlapping tasks; this has nothing to do with burstable CPU credits. The current service lacks application health checks, so circuit breaker evidence chiefly covers launch/startup failures. A first deployment has no completed rollback target. [Circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html).

### Native rollback is not an MRU fallback chain

ECS restores its most recent completed regional service revision, not `keep-mru-1`, then 2, then 3. Example: global C/B/A, regional B never succeeded; C failure can return directly to A. If that rollback fails, native ECS does not promise recursive older-image recovery. It does not retag ECR, and regional failure does not remove a release from global app history. Explicit retry or a new corrected/older-set promotion is the selected recovery path.

### MRU mechanics and tag names

The adopted names and implementation are in [release identity and retention](../../docs/releases.md#release-identity-and-retention). Exact high-priority count-one rules protect each alias, then a seven-day `any` rule removes unprotected tagged and untagged artifacts. Multiple patterns in one rule are AND, not OR; wildcard count-three retention orders by push age, not app MRU. `lastRecordedPullTime` is coarse and does not establish rollback usefulness. OCI documents have no subject relationship so reusing/deleting an initializer does not implicitly erase distinct history. [Lifecycle evaluator](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html), [image metadata](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_ImageDetail.html).

Temporary publication aliases replicate but their deletion does not. Operator cleanup verifies complete destination aliases before removing redundant staging protection; the read-only gate never writes ECR. Fixed history is not an indefinite cold-recovery guarantee for a region that misses many releases.

## Scheduled reconciliation cost and concurrency

September 21 illustrative estimate: 720 hourly invocations/month/region, Lambda 256 MiB for two seconds each, US East x86 reference pricing. Lambda requests/compute plus Scheduler are approximately $0.0069 per region/month before free allowances; this is not measured runtime or verified destination pricing and excludes logs/state/notifications. Implementation uses an hourly EventBridge rule and ARM64 Lambda, so that earlier Scheduler estimate is only a scale reference. No provisioned concurrency. [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/).

Reserved concurrency one does not provide FIFO, duplicate suppression, serialize ECR publishers, or keep a lock while asynchronous ECS deployment runs. Conditional attempt records and live service state remain necessary. A lost `UpdateService` acknowledgement is ambiguous, not permission to retry automatically. [Concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html).

## Managed release primitives

CodePipeline's standard ECS action registers task-definition revisions, so it does not fit the selected ownership boundary. ECS service revisions provide observed image sets, but are not a cross-repository readiness barrier. Service Catalog/AppRegistry represent infrastructure/application metadata, not this image-release contract. OCI artifacts provide storage/distribution; Ghostline interprets its small release document. [CodePipeline ECS action](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-ECS.html), [service revisions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-revision.html), [OCI artifacts](https://aws.amazon.com/about-aws/whats-new/2024/06/amazon-ecr-oci-image-distribution-version-1-1/).

## Optional future blue/green EIP handoff — not selected

Headless ECS lifecycle hooks could call a custom EIP reassociation controller with temporary second-host capacity. Native ECS does not move our CloudFormation-owned EIPs; ownership would need redesign. Two EIP moves are not atomic and do not transfer TCP, AWG ephemeral state or NAT connections. A finite bake window could retire the old host afterward; permanent idle pairs are unnecessary. Anthony initially deferred this work; on September 21 he queued its evaluation after host OS selection. No cutover mechanism is selected. [Current scope](host-os-evaluation.md#blue-green-follows-os-selection). [Blue/green](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-blue-green.html), [hooks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-lifecycle-hooks.html), [AssociateAddress](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_AssociateAddress.html).

## OCI artifact implementation finding

September 21 live ECR rejected an OCI artifact with zero layers (`Image has to have at least 1 layer`). Store the release JSON as a custom-media-type layer, with the same JSON in a manifest annotation; validate the annotation against the layer digest/length. The gate then needs only BatchGetImage, without registry auth or blob access. The empty OCI config is a separate `{}` blob. Engine manifest/blob copying preserved the exact accepted digests.

## Notification package findings

SNS-only event routing does not need personal-assistant's metric/alarm bridge for AWS User Notifications. The extracted package keeps event/alarm registration and parameter-backed email subscriptions, removes legacy logical IDs, hashes physical IDs instead of exposing email addresses, and handles paginated/pending subscriptions. `Unsubscribe` takes a subscription ARN but IAM authorizes the **topic** resource. [SNS authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sns.html).

SNS email confirmation is per-topic, not a global verified-recipient flag. On September 21 both original regional messages were unread in Gmail Spam, grouped in one thread, while SNS reported `PendingConfirmation`. Check metadata/status and Spam before resending or inspecting unrelated projects’ recipient parameters. Pending subscriptions cannot deliver alerts. Anthony subsequently confirmed both; metadata-only readback returned a confirmed ARN for each. Confirmation is not evidence that a later operational alert reached the inbox. [AWS email subscriptions](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html).

## CloudTrail prerequisite for change alerts

September 21 live audit found no trails in either gateway region. Default 90-day Event history does **not** satisfy EventBridge CloudTrail event delivery. The regional release stack therefore owns a single-region write-management trail and private seven-day encrypted S3 storage. Management trail selectors cannot restrict to ECS/eventName (those richer filters require an event data store); do not silently assume an ECS-only trail. No existing trails or global service collection are altered. If adopting a shared trail later, verify logging and write-event coverage before removing this one. [EventBridge prerequisite](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event-cloudtrail.html), [selector limits](https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/API_AdvancedFieldSelector.html).

## Live rollout verification — September 21

Both direct publishers replicated runnable images, OCI documents and moved aliases to all four regions. Two real promotions completed through each regional gate, leaving task revision 4 unchanged. Explicit re-seeding and duplicate wakeups did not redeploy. Final production and MRU1 documents/images agree globally; temporary protection/probe aliases were removed. All 12 initial lifecycle previews preserved protected artifacts. Historical documents may refer to history beyond the current fixed window; only the current document’s direct retained list determines protection, not a transitive ancestry graph. [Evidence](../handoff.md#completed-release-distribution--september-21-2026).

The live CloudTrail call audit recorded exactly two successful gate UpdateService requests per region. Records include `dryrun: false` in addition to the three intended fields; adapter regression tests continue to require the exact SDK input `{cluster, service, forceNewDeployment: true}`. Do not mistake this observed audit metadata for a task-definition mutation.

A subsequent fresh-build publication exercised the normal qualified-image path: the initializer subprocess-environment improvement passed a failing-before/passing-after central regression and both encrypted protocols, then automatically deployed once per gateway. The build reused the same AWG runtime child but produced a different OCI index (build metadata); distinguish root/index identity from actual runtime bytes when reporting changes. Production and two prior sets agree across all four registries. [Fresh-build evidence](../handoff.md#completed-fresh-initializer-release--september-21).

## Replication readback equality — September 22

AWS returns destination objects with field ordering that differs from request construction. Compare normalized destination/filter sets, not raw JSON serialization, or idempotent activation falsely reports pending cleanup and repeatedly rewrites unchanged policies. The isolated four-region native exercise caught this; `replicationRulesEqual` and its actual-shape regression now cover it. Both Stockholm and Cape Town originated immutable probe artifacts that reached all four registries; production aliases were untouched. The experimental prefix and repositories were removed afterward.

## Read-audit feedback loop found during Ireland activation

September 22: enabling the shared read/write management trail made the former source-only `aws.ecr` arrival rule unsafe. The controller's own `BatchGetImage` reads appeared as CloudTrail events and retriggered it; Ireland's lifecycle claim remained busy and direct invocation was throttled. This was not a new image publication. Narrow the native rule to successful `ECR Image Action` PUSH / `ECR Replication Action` REPLICATE events for owned repositories, with a separate CloudTrail `PutImage` write rule for aliases. The Lambda also drops irrelevant ECR events **before any AWS call**, because queued events survive a rule update. Keep hourly reconciliation for missed delivery. [AWS event examples](https://docs.aws.amazon.com/AmazonECR/latest/userguide/ecr-eventbridge.html).

When adding an account audit baseline, review consumers of AWS API events: broader auditing can expose self-triggering control loops in existing source-only rules. Preserve the stronger audit baseline and correct the consumer, rather than removing read audit coverage. Targeted tests cover read rejection, native publication/replication, alias writes, unrelated repositories and queued-event short circuiting. Live correction/evidence is tracked in the handoff.

The fix is now deployed in Stockholm, Cape Town and disposable Ireland. AWS TestEventPattern checks pass for all four event classes (PUSH, REPLICATE, PutImage, rejected BatchGetImage); all publication/alias/hourly rules remain enabled. Production task ARNs and address associations are unchanged. The Ireland controller became idle and normal host deployment acquired its lifecycle claim without bypassing exclusion. Evidence: `.local/coordinated-release/arrival-fix-verification.json` and `shared-audit-migration.json`.

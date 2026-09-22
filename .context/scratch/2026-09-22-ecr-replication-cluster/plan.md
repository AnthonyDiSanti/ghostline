# ECR replication cluster implementation plan

Status: selected follow-up, September 22, 2026. Implement immediately after the Bottlerocket work unit, before blue-green evaluation. This is a plan only; the deployed primary/DR workflow remains described in [releases](../../../docs/releases.md) until migration.

## Goal and boundaries

Any enrolled regional registry can originate a Ghostline release and replicate directly to every other member. Choose the publication region per command; switching between enrolled sources requires no CDK deployment or gateway configuration change. Dedicated primary/DR roles are unnecessary. Keep the project independently hostable.

- Introduce reusable `EcrReplicationCluster` membership with explicit account/region identities and repository prefixes. Membership follows durable registry infrastructure, independently of gateway uptime.
- Preserve qualified artifact identities, OCI release documents, production plus three prior releases, regional retention, CDK-owned static local task references, hourly/event gates, limited gate IAM and native ECS rollback.
- Keep one operator publication in progress at a time. Any-source publication does not make aliases transactional or resolve concurrent promotions.
- Scope replication to explicitly selected Ghostline repositories. Do not automatically enroll other projects, trial images or the Bottlerocket platform helper in the application release contract.
- Uploading locally first does not guarantee the local ECS rollout finishes first. Strict canary testing would require testing immutable candidates before moving production aliases; do not silently add that gate or change the existing once-central qualification policy.

## 1. Capture the migration baseline

Inspect live membership, registry rules/settings, complete production/MRU documents, gate state and task references. Reconcile the final Bottlerocket outcome before selecting image namespaces. Record only nonsecret metadata/digests.

Stockholm and Cape Town are the initial gateway members. Keep NVA/London as ordinary members during migration so existing copies remain available; explicitly audit their eventual retirement. Removing source roles does not itself authorize deleting repositories or shared infrastructure.

Checkpoint: identify exact existing resource ownership and a complete copy of every protected image/document.

## 2. Extract topology and reconciliation

Refactor `infra/lib/releases/topology.ts` and `operator.ts` around `EcrReplicationCluster`. Persist one member list in the deployment profile; replace primary/DR special cases through a deliberate one-time profile migration without leaving legacy runtime branches.

For each member, derive destinations as all other members. Validate identities, duplicates, prefixes and current ECR quotas. A one-member cluster has no outbound rule; never send an empty destination list. Retain region-bound CDK stacks and stable existing repository/resource names.

Reconcile only owned prefix entries in ECR's regional registry-wide configuration. Preserve unrelated rules and report overlapping ownership. Reconciliation is idempotent; unavailable members remain intended members with pending configuration. Keep generic distribution separate from Ghostline release history and ECS gates.

Checkpoint: tests cover one/two/many members, self-exclusion, mixed/unrelated filters, quotas, removals and unavailable-region retries.

## 3. Publish from any member

Replace `publish primary|dr` with `publish <target-or-region>` resolving to an enrolled, ready registry. Proposed commands: `npm run release publish stockholm-ecs` and `npm run release publish cape-town`. Preserve exact-artifact qualification, interrupted-publication resume and unchanged-release no-ops.

Verify the selected origin's outgoing rules and complete production/history. Compare known release documents across reachable members and refuse a known-stale or divergent origin; repair it explicitly before promotion. Compare immutable promotion identity/history as well as timestamps. With unreachable members, global freshness cannot be proven: report ambiguity and retain the single-operator publication contract instead of inventing consensus or overwriting conflicting history.

Freeze the source release snapshot during publication/seeding and detect intervening intent changes before selectors move. Gate concurrency one does not serialize publishers. Preserve temporary protection, production-document-last rotation, final regional alias checks and the accepted short ECS capture race.

Checkpoint: switching sources changes neither CloudFormation templates nor task definitions. Cover stale/incomplete origins, interruption, source switching and duplicate publication in regression tests.

## 4. Seed and enroll a new region

1. Prepare repositories, matching settings/retention and release resources, with outgoing cluster replication inactive and deployment automation held.
2. Select a reachable member with complete current production and its up to three directly retained predecessors. Freeze those document identities; do not traverse unlimited ancestry or rebuild images.
3. Reuse `seedRegion`/`copyImage` to transfer missing manifests, configs, layers, platform children and release documents, preserving digests and immutable tags. Shared artifacts need copying only once.
4. Verify all retained sets, recreate protection/production aliases and move the intended release selector last. Interrupted copies resume without creating a new promotion or rotating history.
5. Recheck source intent and destination completeness, then reconcile incoming/outgoing membership and enable the regional gate. Enabling outgoing rules after seeding avoids fanning these backfill uploads out to existing members.

Incomplete enrollment stays visible and retryable; an incomplete registry is not a ready publication source. A first-ever member can start empty and receive the first qualified publication instead of requiring a nonexistent seed source. Later repairs to already-enrolled members must account for direct copies/retagging being new outbound replication triggers.

Checkpoint: empty-region seeding preserves production plus all three historical sets/digests; retry/repeat seeding creates no promotion or unnecessary deployment.

## 5. Retire members and migrate current resources

Endpoint stop/park/destroy continues to retain registry membership. Explicit registry retirement removes incoming references from remaining members and clears owned outgoing rules at the departing member. Reconcile the union of previous and next membership so departing members are not skipped. Unreachable cleanup remains pending; verify retained copies/live references before any repository deletion.

After Stockholm/Cape Town can each publish, explicitly audit and retire redundant NVA/London publisher-only resources. Limit cleanup to owned release resources after fresh diffs/reference checks; preserve unrelated infrastructure, regional GuardDuty and account controls. Do not make deletion an automatic consequence of editing membership.

At cutover, update release/development/lifecycle specifications and profile examples, removing superseded primary/DR instructions. Promote acceptance evidence from this scratch plan and remove the plan when obsolete.

Checkpoint: source selection requires no redeploy, enrollment/retirement is repeatable, and remaining regions retain the full protected release window.

## 6. Verify distribution and close

Run targeted topology/publication/seeding tests, then the full `infra/` gate (`npm test`: typecheck, fixtures, fresh synth and Vitest). Compare gateway task definitions, static image references and endpoint identities with the baseline; run fresh CDK diffs before infrastructure changes.

Use an isolated repository prefix for live mesh/backfill tests before production aliases. Demonstrate publication from two distinct members reaching all destinations, historical seeding, partial delivery, duplicate wakeups, source switching and removal. Verify artifact identity/distribution; do not repeat encrypted-protocol qualification as a delivery gate. A topology-only production migration should cause no gateway turnover.

Check that ready local releases remain usable when another member is unavailable. Recovery must report/repair missing copies instead of assuming native backfill. Audit retention previews, unrelated rules, unchanged task-definition revisions and disposable-resource cleanup.

Done: every enrolled registry can publish; historical seeding and retirement work; artifacts/history survive migration; gateway release/security behavior is preserved; dedicated primary/DR roles and obsolete code paths are gone. Blue-green evaluation follows as a separate work unit.

## Sources and implementation pointers

- [Current release workflow](../../../docs/releases.md), [AWS/release findings](../../knowledge/event-driven-releases.md), [regional lifecycle](../../../docs/deployment-lifecycle.md).
- `infra/lib/releases/{topology,operator,publication,registry,gate,model}.ts`, `infra/scripts/release.ts`, `infra/bin/releases.ts`, deployment-profile validation and release tests.
- [AWS replication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html): one-hop propagation, no historical backfill, no replicated deletions/policies and prefix-based filtering.
- [Registry replication API](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_PutReplicationConfiguration.html): regional singleton configuration; preserve unrelated ownership.

Recording this plan makes no code, cloud, client or release-alias changes.

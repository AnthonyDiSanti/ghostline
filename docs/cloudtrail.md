# Account audit coverage

CloudTrail is a persistent account invariant, like the regional GuardDuty enable-only policy. Ghostline tooling discovers or establishes coverage; endpoint and release stacks must not own the shared trail. Destroy never stops or deletes it. AWS's free regional 90-day Event History is separate: [CloudTrail-backed EventBridge rules require an active logging trail](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event-cloudtrail.html).

From `infra/`, `npm run audit <region> check` is read-only; `ensure` establishes missing shared coverage. Release infrastructure deployment runs the same ensure preflight. The helper reads account/organization trails including shadows, home-region selectors, regional logging state and delivery errors. Denied or missing settings are unknown coverage, not absence. A readable, active multi-region trail covering ECS `RegisterTaskDefinition` and `UpdateService` management writes is reusable without modifying its ownership, tags, selectors, encryption or retention. Narrow write-only coverage produces an explicit warning that full management read/write/global/validated auditing is not established.

If no adequate shared trail exists and discovery is readable, the explicit new-baseline defaults are:

- Home region `us-east-1`, name `account-management-audit`.
- Destination `account-management-audit-<account>-us-east-1`, private, bucket-owner enforced, SSE-S3 encrypted and TLS-only, preserving AWS’s default SSE-C block. CloudTrail writes are restricted to the exact trail ARN, account and `AWSLogs/<account>/` prefix.
- Multi-region management read/write, global service events and log-file validation. No data events, Insights or CloudWatch Logs duplication.
- Seven-day S3 object expiry and one-day incomplete-upload cleanup. Persistent service does not mean indefinite event retention.
- Neutral `AccountSecurityBaseline=cloudtrail-v1` ownership marker and `System=security`; no application CloudFormation ownership or Ghostline cost attribution.

`CreateTrail` and `StartLogging` are distinct. Deterministic names make concurrent creators converge; repeat ensure is read-only once adequate protection is observed. Marked partial setup can resume. A nonsecret local successful bucket-creation receipt permits recovery before tagging; an unmarked existing bucket without that receipt is not silently adopted. Existing different baseline settings, including retention, require an explicit review before mutation. Other applications' stopped or narrow trails remain untouched.

Multi-region shadows in newly enabled regions can lag. Verification retries are bounded (normally 12 checks at five-second intervals); unresolved coverage leaves existing producers active and reports pending work. [AWS regional propagation](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-multi-region-trails.html). Adequate configuration/logging status establishes the prerequisite, not an end-to-end notification receipt. Migration additionally checks successful recent S3 delivery before removing old producers.

The September 22 migration is verified. Anthony approved NVA/seven-day retention. The shared multi-region trail is active and has delivered S3 objects from NVA, London, Stockholm and Cape Town. Both regional stacks first deployed and read back retention, then removed their redundant `ghostline-prod-release-audit` producers. Their private buckets and TLS/source-scoped policies remain, with seven-day expiry. Production task identities and EIP associations did not change. No shared baseline is removed during teardown; account management activity can continue incurring storage/delivery charges independently of Ghostline.

Implementation: `infra/lib/cloudtrail/{coverage,baseline,operator}.ts`; regressions: `infra/test/cloudtrail.test.ts`. [DescribeTrails](https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/API_DescribeTrails.html), [GetTrailStatus](https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/API_GetTrailStatus.html), [source-scoped S3 policy](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/create-s3-bucket-policy-for-cloudtrail.html).

Live S3 readback includes `BlockedEncryptionTypes={EncryptionType:[SSE-C]}` on new buckets. Preserve that control rather than interpreting the extra field as an encryption mismatch or rewriting it away. [AWS default SSE-C policy](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-s3-c-encryption-setting-faq.html). The regression uses this actual response shape.

### Event consumer safety

Full management read coverage also exposes read API events to EventBridge. Consumers must select actual mutations: a source-only ECR rule can trigger on a release controller's own `BatchGetImage` calls and form a feedback loop. Ghostline now selects successful owned image pushes/replications and explicit `PutImage` alias writes, with an early handler filter for events already queued before a rule change. Preserve read auditing; fix the consumer. Review this boundary when another application adopts the shared baseline. [ECR event shapes](https://docs.aws.amazon.com/AmazonECR/latest/userguide/ecr-eventbridge.html).

# Logging and tracking audit

Audit date: November 16, 2026. Source baseline: `c837f15d8863b727a5eb95412cbc7840e1a2ca83`, branch `feature/zero-logs`.

## Assessment

November 17 status: the known application recording paths are now fixed in all four active regions; [release and live verification](../.context/scratch/2026-11-17-zero-logs-release/README.md). The findings table and detailed inventory below preserve the November 16 baseline. Initializer disk metadata and independent AWS collection remain unresolved. Anthony selects Runtime host opt-out as the next direction and chooses the credential root fix instead of temporary disk-scan exclusions; the [concrete plan and decision points](../.context/scratch/2026-11-17-zero-logs-release/credential-delivery-plan.md) are proposed, with no IAM/monitoring change applied.

November 17 network follow-up: [fresh metadata](../.context/scratch/2026-11-17-zero-logs-release/network-logging-settings.json) finds zero customer Flow Logs at VPC/subnet/ENI scope and zero direct/profile Resolver query-log associations affecting all four active Ghostline VPCs; Cape has no VPC. [Native DNS probes](../.context/scratch/2026-11-17-zero-logs-release/dns-boundary-probe.json) pass 32/32 fixed public queries from engine namespaces, including UDP/TCP addressed to AWS Resolver endpoints, with observed forced-redirection counters and exact external-DoT Corefile equality. All four hosts verify diagnostic/admin lockdown afterward. These bounded probes do not retrieve GuardDuty's independent DNS/flow/runtime feed or establish every host/device resolver path. DHCP still advertises AWS DNS and the host uses a loopback stub; infrastructure resolver exposure remains distinct from the sampled engine DNS path.

**At the November 16 audit baseline, Ghostline retained information connecting clients to destinations. The November 17 release suppresses the known application traffic logs, while broader zero-history and memory-only guarantees remain unproved.** The most direct problem is Xray access logging, not CloudWatch: the regional server configurations select `loglevel: error` but omit `access: none`. In the exact pinned Xray version, access messages still go to stdout independently of the error level. The deployed Docker log driver writes stdout to persistent disk.

Rendered VPN configurations are kept in RAM, and several diagnostics deliberately suppress secrets. Those protections are useful, but they do not make the surrounding Docker metadata, host journal, AWS security telemetry, administrative history or local exports ephemeral. An EC2 shutdown is not a deletion boundary for those records.

| Priority | Finding | Evidence and consequence |
| --- | --- | --- |
| P0 | Xray access logging remains enabled by configuration | All five regional server parameters have a `log` object with `loglevel: error` and no `access` override. All four running Xray image digests match the recorded official build. Its access messages can include source, destination, status and optional user labels. Docker persists them locally. See F01. |
| P1 | CoreDNS failures can record queried names | The shipped Corefile enables `errors`; its pinned implementation includes the query name and type in error messages. The container uses disk-backed logging. See F02. |
| P1 | Host logging is persistent | Docker JSON logs and the qualified OS's persistent system journal are separate disk paths. Size rotation is not time-based expiry or secure erasure. See F03. |
| P1 | AWS collects security metadata outside the application logs | GuardDuty runtime coverage is HEALTHY on every active host; foundational flow/DNS/account analysis is also enabled. Removing a CloudWatch group would not remove this collection. See F05. |
| P1 | RAM-rendered configs still have durable credential sources/copies | Parameter Store, initializer environment metadata, device profiles and local exports survive independently of the rendered RAM files. See F04/F09. |
| P2 | Operational history survives host retirement | CloudWatch, CloudTrail, SSM, DynamoDB, queues, email, artifacts and metrics have independent lifetimes. Most are control-plane records rather than browsing histories, but they identify ownership, access and activity times. See F06–F09. |
| Architectural limit | The single-provider, dedicated-exit design permits correlation | The access ISP sees the tunnel endpoint and traffic pattern; AWS can observe both network sides; resolvers see questions; destinations see the dedicated exit and application identity. Memory-only application logs cannot erase another party's observations. See F10. |

Priorities reflect privacy impact, not proof that an attacker accessed any data. The November 17 release changes application logging; production security policy remains unchanged. The authorized follow-up briefly enabled existing diagnostics and verified lockdown afterward; source remediation is prepared locally, as described below.

## Follow-up: confirmed records and prepared fixes

After explicit owner authorization, SSM temporarily enabled the existing diagnostic container on Oregon and Stockholm. The probe analyzed logs and Docker metadata **inside each host** and returned counts/booleans only. The initial last-24-hour sample was empty; the subsequent sample inspected up to 200 latest retained lines per selected container/unit, without a time filter. No traffic or DNS failures were induced on production. The standalone [probe](../infra/test/fixtures/logging-audit.py) and [sanitized follow-up evidence](../.context/scratch/2026-11-16-logging-privacy/followup-evidence.json) make the method and limits inspectable.

| Confirmed retained evidence | Oregon | Stockholm |
| --- | --- | --- |
| Xray access records / sampled lines | 200 / 200 | 200 / 200 |
| Xray lines containing a global IPv4 address | 200 | 200 |
| CoreDNS error records / recognized DNS-question shapes | 28 / 28 | 27 / 26 |
| Nonempty initializer secret-environment entries in disk `config.v2.json` | 2, XFS | 2, XFS |
| GuardDuty agent operational journal messages sampled | 25 | 25 |
| Diagnostics disabled, admin disabled, control non-superpowered afterward | Verified | Verified |

These Xray counts establish actual connection records containing public addresses, without identifying which addresses belong to clients or destinations. The DNS counts establish actual question-bearing failures. Both initializer bundles remain nonempty in Docker's persistent creation metadata; an empty initializer stdout log does not prevent this storage. The bounded AWG/network/agent samples matched none of the scanner's IPv4/access/DNS-question/credential patterns. That is a limited negative check, not proof that their entire histories or other formats are safe. No raw lines, addresses, questions, credential values or credential hashes left the hosts. SSH and security-group changes were unnecessary. Runtime Monitoring and malware protection remained enabled.

**GuardDuty records were retrievable; the raw runtime feed is not.** Stockholm has three retained October 5–6 findings: `UnauthorizedAccess:EC2/TorClient`, `UnauthorizedAccess:Runtime/TorClient` and `DefenseEvasion:EC2/UnusualDoHActivity`. All contain remote-IP metadata; the Runtime finding contains runtime details. Their dates and types are consistent with the retired Tor evaluation, but this inspection does not establish their cause or a new compromise. AWS explicitly says it [does not make collected runtime events accessible to customers](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring-collected-events.html). Agent service diagnostics are a different stream. We therefore cannot download that feed to enumerate every collected Ghostline DNS question or establish its raw retention.

**The malware-copy mechanism actually ran.** Retained scan metadata matches a documented Stockholm Ghostline host: a GuardDuty-initiated scan from October 5 23:56 UTC to October 6 00:20 UTC, status `COMPLETED`, result `CLEAN`, two attached volumes and snapshot references. It proves scanning/snapshotting occurred; it does not prove which credentials or log bytes were present in the historical snapshots. No matching customer-visible scan snapshot is currently returned in the five maintained regions, all with `NO_RETENTION`. This does not independently inspect or prove deletion of service-account replicas. Other regions returned no matched scan/finding in the available history; this is not an all-time absence claim.

**Released November 17:** the initializer enforces quiet Xray/REALITY diagnostics in RAM without rewriting stored identities; CoreDNS per-question errors are removed, AWG is silent and network/host-tool failures withhold free-form details. Exact-byte native qualification, four regional blue-green rollouts, eight encrypted-client checks and four security/log-policy probes pass. [Release evidence](../.context/scratch/2026-11-17-zero-logs-release/README.md). All credentials/endpoints and GuardDuty settings are preserved. Historical external records were not erased, and both initializer secret values still persist in Docker metadata.

**Credential root fix qualified November 17:** a fresh Stockholm baseline scan confirms all three server bundles (now including DERP) in Docker metadata and the ECS checkpoint. Supported Bottlerocket mounts cannot place that checkpoint in RAM, so the owner-accepted fallback retrieves exact parameters inside the initializer and renders through private stdin into RAM. Cold, task-recovery and reboot scans find zero matches for nine protocol values and three current temporary task credentials across complete/stable scans of Docker metadata, ECS checkpoint, containerd metadata and ECS logs. Native security, encrypted Xray/AWG, DERP/STUN and central platform qualification pass. [Evidence and limits](../.context/scratch/2026-11-17-zero-logs-release/native-credential-trial.md). The single-region experiment returned to baseline and closed before the separately authorized [November 18 fleet adoption](../.context/scratch/2026-11-17-zero-logs-release/fleet-adoption.md). The fix is now deployed on Stockholm/Oregon/Zurich/NVA; all four native privacy probes have zero tested key/credential matches across the four bounded stores. Cape Town retains the same ready release while parked. Original automation, identities/endpoints and shared protection settings are preserved; historical copies are not erased.

The gateway fleet subsequently adopted Runtime Monitoring opt-out. Broader fixed-schema cloud/error and host/dump review remains open. Temporary malware-volume exclusions are withdrawn: preserve all EBS scanning and shared controls while fixing secret delivery directly. [Current plan](../.context/scratch/2026-11-17-zero-logs-release/credential-delivery-plan.md).

## DERP/STUN follow-up — November 17

DERP/STUN is included in the credential root fix and its native trial, rather than relying only on its RAM mount. The old initializer received `GHOSTLINE_DERP_BUNDLE`: the TLS certificate/private key and stable DERP server key. The Stockholm [baseline positive control](../.context/scratch/2026-11-17-zero-logs-release/native-credential-before.json) finds that bundle and DERP key material in both Docker metadata and the ECS checkpoint. The image build receives source/toolchain inputs, not production identities; the persistence defect is runtime container creation.

The new [shared loader](../runtime/ecs/secret-loader.go) retrieves the DERP parameter directly into memory. Its [private stdin handoff](../runtime/ecs/gateway-config.sh) supplies `derp-tools render`, which checks private unswapped RAM and writes the certificate, TLS key, `derper.json` server key and public health metadata there. DERP mounts only that directory read-only. It does not receive those values as environment variables or arguments. Task-role authority remains shared; normal DERP credential-endpoint access is blocked and natively tested.

The [candidate scan](../.context/scratch/2026-11-17-zero-logs-release/native-credential-green.json), [task-recovery scan](../.context/scratch/2026-11-17-zero-logs-release/native-credential-task-recovery.json) and [reboot scan](../.context/scratch/2026-11-17-zero-logs-release/native-credential-reboot.json) each find zero tested DERP key matches in complete/stable scans of Docker metadata, ECS checkpoint, containerd metadata and ECS logs. DERP comparisons cover its stable server key and both full-PEM/base64-body forms of the TLS private key; these are three comparison strings, not three independent private keys. Raw values remain inside the host.

For logging, [the serving wrapper](../runtime/ecs/derp-tools.go) redirects upstream stdout/stderr to `/dev/null` before exec. Its own health/render failures emit fixed categories or a fixed withheld-details message. [Real image tests](../infra/lib/derp-image-tests.ts) assert empty daemon logs after two-client transfer, wrong-pin rejection and UDP-unavailable relay operation. The task uses bounded persistent Docker JSON logs, and Docker/ECS retain health/exit/timing metadata; source suppression, rather than the log driver's size cap, prevents the tested client/key output. Network controls also deny new outbound initiation from DERP. This does not prove absence in every host/provider sink or delete historical copies.

The [November 18 fleet adoption](../.context/scratch/2026-11-17-zero-logs-release/fleet-adoption.md) now covers DERP on all four active gateways. The earlier experiment's captured baseline return is historical; current hosts use the new delivery path. Parameter Store intentionally retains identities. No identity rotation, shared monitoring-policy change or additional cloud probe was performed for this documentation follow-up. [Full native scope and closeout](../.context/scratch/2026-11-17-zero-logs-release/native-credential-trial.md).

## Northern Virginia browsing sample — November 18

After Anthony reported having just browsed through NVA, the audit used the 08:22–08:53 UTC window on the same serving gateway. Docker returned zero stdout/stderr records from Xray, AWG, CoreDNS, DERP, the initializer and the network daemon. The initial pass also checked three retained health-check entries with no client IP, destination, DNS question or credential-shaped marker. The rolling health cache had advanced beyond the window by the final pass.

The host journal had 147 messages. None matched an IPv4/IPv6 address, connection access record, DNS question, destination field or credential marker. The 19 hostname-shaped messages matched AWS service endpoints (18) or a system label (1). Four NVA release-stack CloudWatch groups contained five events. The sole IP-shaped token came from a Lambda runtime-version line. Current metadata showed zero customer VPC Flow Logs at VPC, subnet and interface scope and zero direct or profile-based Resolver query-log associations for the gateway VPC.

These observations cover retained records in the bounded window and known browsing-log shapes. Flat files outside the checked surfaces, crash and support artifacts, provider-managed telemetry and client-side history remain outside the sample. Administrative lockdown was verified after the temporary diagnostic container was stopped. Count-only receipts are under ignored `.local/nva-browsing-audit/`.

## Scope, method and evidence limits

The source review covers the gateway, initializer, networking daemon, bootstrap/diagnostics, DNS, release automation, notifications, secret handling, administrative transport, benchmark tools and local artifact writers. Live reads cover all five maintained regions, plus a logging/network inventory across the account's 34 enabled regions. Thirty-three regions responded; Bahrain (`me-south-1`) remains unverified.

Evidence labels used below:

- **Live configuration:** AWS returned the deployed setting or current parameter's logging controls. This proves configuration, not the presence or absence of individual traffic records.
- **Source behavior:** the project or exact upstream implementation defines the behavior. Where a host file was not examined, that is stated.
- **Content sample:** actual CloudTrail records were inspected in memory after explicit owner authorization. No raw record or credential value was saved or displayed.
- **Unverified:** evidence is insufficient; this is not a clean bill of health.

The initial inventory used no production shell or diagnostic enablement. The authorized follow-up above supersedes that host-content gap with bounded on-host analysis. That initial inventory/content follow-up performed no traffic capture, production VPN probe/test lookup/failure injection, queue-body read or device-database inspection; SSM returned sanitized counts only. Later explicitly authorized native qualification and fleet smoke-test scope is recorded in the linked release evidence. Reading the regional Xray server values was confined to extracting logging controls inside the audit process; private keys, device identities and complete configs never entered the report or evidence files.

The sanitized [evidence snapshot](../.context/scratch/2026-11-16-logging-privacy/evidence.json) records counts, configurations and coverage gaps. Physical CloudWatch group names are listed in the [inventory appendix](#cloudwatch-log-group-appendix). Ignored intermediate receipts are under `.local/logging-audit-2026-11-16/` in this worktree. These receipts contain selected metadata and redacted scan findings, not downloaded log payloads.

The read API inventory includes CloudWatch log-group/subscription policies; ECS clusters, services, definitions and running image identities; EC2 VPC/ENI/volume/snapshot/flow/mirror metadata; Resolver query-log associations; Lambda log/tracing configuration; GuardDuty detector/coverage/export/scan settings; SSM command/session destination metadata; DynamoDB TTL/PITR settings; SQS retention/counts; SNS delivery-log/archive attributes; EventBridge archives/rules; and named S3 bucket logging/lifecycle/version/replication settings. CloudTrail selectors/status, object listing and the authorized bounded content sample are separate checks. This inventory is reproducible from those APIs without exporting production configs or retrieving the ordinary traffic log stream.

### Observed regional state

Initial inventory: 12:58:43–12:59:47 UTC; additional targeted checks and the content sample followed on the same date. The evidence snapshot records the initial inventory and content-sample timestamps and sampling limits.

| Region / target | Gateway | Task revision: gateway / network | Container logs | GuardDuty runtime | CloudWatch release groups |
| --- | --- | --- | --- | --- | --- |
| Oregon / `us-west-2` | One running host | 1 / 1 | Five definitions: `json-file`, `1m`, one file each | HEALTHY, v1.17.3 | 4; seven days |
| NVA / `us-east-1` | One running host | 1 / 1 | Same | HEALTHY, v1.17.3 | 4; seven days |
| Stockholm / `eu-north-1` | One running host | 11 / 6 | Same | HEALTHY, v1.17.3 | 4; seven days |
| Zurich / `eu-central-2` | One running host | 1 / 1 | Same | HEALTHY, v1.17.3 | 4; seven days |
| Cape Town / `af-south-1` | Parked; no host | No active service | No current host log producer | Plan enabled; no running host to cover | 4; seven days |

All four active hosts have encrypted 2 GiB OS and 30 GiB data volumes, with deletion on instance termination enabled. Hibernation is not configured. EC2 detailed monitoring, ECS Container Insights and ECS Exec are disabled on these deployments. Basic service metrics still exist. No project-tagged snapshot was found in the five maintained regions; this does not exclude untagged, historical or provider-held copies.

Across the 33 reachable regions, the name-matched inventory found **41 Ghostline CloudWatch groups**, each with seven-day retention: 20 current release groups and 21 historical benchmark/release groups. The aggregate reported `storedBytes` was 509,473. This is a storage-accounting snapshot, not a count of sensitive events; zero bytes is not evidence that a group never logged data.

Additional name-based checks found no Ghostline Lambda function or DynamoDB table in the four historical-log regions (Mumbai, Hyderabad, Frankfurt and Milan). Frankfurt retains three empty 14-day failure queues and Milan one; their message bodies were not read. Thus the historical inventory includes retained resources beyond the five current deployment regions.

No customer-configured flow-log resource, Resolver query-log association or Traffic Mirror session was found attached to currently project-tagged VPCs/subnets/ENIs in the reachable regions. That excludes those configured sinks within this ownership scope; it says nothing about GuardDuty's independent collection or untagged infrastructure.

## Data path and trust boundaries

```text
Device and browser
  -> access ISP / Wi-Fi / carrier
  -> encrypted REALITY or AWG connection to a dedicated AWS EIP
  -> one Bottlerocket host: VPN decryption, routing and connection state
       -> ordinary DNS in plaintext on the private host bridge
          -> CoreDNS -> TLS -> Cloudflare, with Google fallback
       -> destination connection, normally protected by its own HTTPS
  -> destination / CDN / application account

Parallel records: Docker + host journal; GuardDuty; AWS control plane;
CloudWatch + SSM + release state; operator/device artifacts.
```

The VPN protects traffic on the device-to-gateway leg. HTTPS separately protects application content between the application and its TLS peer. The gateway still processes destination addressing, and ordinary DNS is visible after VPN decryption before upstream DoT. No source change in this repository can make AWS, the ISP, a resolver or a destination forget records already retained by that party.

## Findings

Findings describe the November 16 deployed baseline. The dated release evidence above records the shipped remediation and supersedes initial evidence gaps; linked source files include that remediation.

### F01 — Xray is configured to write connection access logs

**Live configuration:** every maintained region's `/ghostline/prod/server/xray` parameter is version 1 and contains a `log` object with `loglevel: error`. Neither `access` nor `error` is specified; `dnsLog` and address masking are also absent. The configurations do not enable the Xray stats/API sections, and REALITY `show` is false. Those latter settings do not disable access logging.

The pinned [Xray v26.3.27 configuration builder](https://github.com/XTLS/Xray-core/blob/v26.3.27/infra/conf/log.go) initializes **both** access and error outputs to the console when a `log` object exists. `loglevel: error` sets only error severity. `access: none` disables access output; `loglevel: none` disables both. A subtle distinction matters: the no-`log`-object default disables access logs, but an existing partial `log` object follows the other path.

The [runtime handler](https://github.com/XTLS/Xray-core/blob/v26.3.27/app/log/log.go) dispatches access messages independently of error severity. The [access-message implementation](https://github.com/XTLS/Xray-core/blob/v26.3.27/common/log/access.go) formats source, destination and acceptance/rejection, with optional routing/user information. Destinations can be an IP or a hostname supplied to the proxy; this is not a full HTTPS URL or page-content log. The [console writer](https://github.com/XTLS/Xray-core/blob/v26.3.27/common/log/logger.go) adds timestamps.

The four running Xray digests match `infra/image-inputs.json`'s official v26.3.27 digest. Deployed task definitions route output into Docker JSON files. The regional parameter is the configured source. Follow-up log samples on Oregon and Stockholm confirm 200 retained access records containing global IPv4 addresses on each host. NVA and Zurich were not sampled; their matching configuration/image identities establish the same configured path, not inspected individual records.

Root cause in deployed artifacts: bundle validation and the initializer preserved the imported logging configuration without enforcing a privacy policy. The branch now enforces the policy during RAM rendering while preserving stored bundle bytes and protocol identities. A low error level can therefore look privacy-conscious while leaving successful access events enabled.

**Released remediation:** explicit access/error/DNS silence is enforced at the RAM-rendering boundary; stored protocol identities are preserved. Central native qualification, all four regional rollouts and the listed smoke/privacy checks passed November 17. Test the pinned engine's successful and rejected connection paths with synthetic identities. Do not silently rewrite production secrets during this audit.

### F02 — CoreDNS error logs can contain browsing names

The [Corefile](../runtime/ecs/dns-policy.Corefile) does not enable the `log` plugin, so there is no deliberate successful-query access log. It enables `errors`. The exact [CoreDNS v1.15.0 implementation](https://github.com/coredns/coredns/blob/v1.15.0/plugin/errors/errors.go) includes the query name, query type and underlying error in emitted failures. Omitting the query-log plugin is therefore insufficient. [CoreDNS documents the separate error channel](https://coredns.io/plugins/errors/).

The deployed resolver's Docker output is disk-backed, with the same one-file/`1m` bound. A failed lookup can leave a hostname, timestamp and diagnostic context even when most successful lookups leave no resolver log. No failure was induced in production. Follow-up on-host analysis confirms 28 Oregon and 26 Stockholm retained error lines matching DNS-question shapes; no actual question text was exported.

**Released remediation / remaining coverage:** the deployed release removes per-question error output and retains fixed health/exit status without query text. Exercise timeout, unavailable-upstream, malformed-query, startup and shutdown paths in an isolated test. Removing only `errors` needs that verification because other CoreDNS components can log independently; do not infer universal silence from one deleted directive.

### F03 — Docker and host logs are persistent, despite read-only roots

[Application task definitions](../infra/lib/ecs-stack.ts) configure `json-file` for Xray, AWG, CoreDNS and the initializer. [The network task](../infra/lib/gateway-platform.ts) does the same. [Docker's documented behavior](https://docs.docker.com/engine/logging/drivers/json-file/) writes stdout/stderr and timestamps to files. `max-size: 1m`, `max-file: 1` bounds the current file per container; it imposes no maximum event age. Old containers, health-check metadata and unlinked disk data are separate from that bound. A quiet file can remain indefinitely while its container/data survives.

The qualified Bottlerocket 1.66.0/core-kit 17 source explicitly sets [`Storage=persistent`](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/release/release-systemd-journald.conf). Its [ECS agent](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/ecs-agent/ecs.service) runs as a system service. Its [Docker default](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/docker-engine-29/daemon-json) is `journald`; Ghostline's explicit task settings override that for its application containers. Deleting the explicit setting would not establish RAM-only logging.

Host journals can include boot, kernel, service, agent, container-runtime, SSM and bootstrap diagnostics. They are not automatically a per-packet browsing history, but errors, audit denials, command context and crash paths can carry sensitive details. The read-only root protects system integrity; writable data storage remains. Live journal sizes, effective retention, ECS log level/cleanup timers, SSM host files, core-dump limits, kernel crash persistence and historical support bundles were **not** examined remotely.

The deployed network daemon prints exception type/text on quarantine; this branch replaces that output with a fixed reason and suppresses native tool details; ordinary reconciliation prints protocol names rather than destinations. The [readiness server](../runtime/ecs/bottlerocket/readiness.py) suppresses HTTP request logs. [DNS health](../runtime/ecs/dns-health.go) reports by exit status and uses fixed public test names, not client questions. These are favorable boundaries but do not silence upstream daemon/crash output.

**Recommended next change:** suppress sensitive application records at their source first. Treat a memory-only operational ring buffer, journald volatility and dump prevention as a separate supported-platform qualification. ECS's [documented log-driver list](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters_ec2.html#container_definition_logconfiguration) does not include Docker's `none`; an omitted driver, `non-blocking` memory buffer or smaller rotation value is not a verified no-disk solution. Do not patch generated Bottlerocket configuration or replace the official ECS agent as an incidental logging fix.

**Remaining EBS exposure after the November 18 rollout:** scans can still copy the bounded Docker stdout/stderr files, persistent host journal, agent and bootstrap files and any disk-backed crash or support output. The release suppressed the confirmed Xray address and CoreDNS question records. Native checks on all four replacement hosts found zero matches for nine protocol-secret values and three temporary task credential values in Docker metadata, the ECS checkpoint, containerd metadata and ECS logs. Those checks leave the journal, Docker stdout/stderr contents, dump paths and arbitrary historical blocks outside their exhaustive coverage. Current samples establish no new sensitive disk-log finding. [Fleet evidence](../.context/scratch/2026-11-17-zero-logs-release/fleet-adoption.md).

### F04 — RAM configuration does not mean RAM-only credentials

[Storage bootstrap](../runtime/ecs/bottlerocket/storage.py) requires a private 2 MiB tmpfs and rejects host swap. [Config preparation](../runtime/ecs/config-start.sh) refuses disk fallback and uses restricted ownership/modes. The initializer removes partial files on failure and emits a fixed failure message with detailed stderr suppressed. Engines receive protocol-private read-only mounts and no secret environment entries/task role in their definitions.

However, ECS injects both server bundles into the initializer's environment before the shell unsets them. Unsetting process variables does not rewrite the Docker container-creation metadata. Privileged runtime metadata/checkpoints on encrypted data storage can retain the original values. This is an acknowledged [secret boundary](secrets.md#ecs-delivery-and-threat-boundary), not a newly proven exfiltration. The authorized follow-up confirms both nonempty initializer bundles in Docker inspect metadata and disk `config.v2.json` on XFS on Oregon and Stockholm. Values were counted locally and never exported. Other host checkpoints were not examined.

Separately, Parameter Store intentionally persists server/device identities and history, and `.local/recovery/` contains exported credential-bearing profiles/links/QRs. These are not browsing logs; they are durable identity and future-access material. Their survival is consistent with the current recovery policy but incompatible with a literal claim that all sensitive state vanishes at shutdown.

**Recommended next design review:** separate the requirement “retain no browsing history” from “persist no usable credentials.” Removing environment-metadata persistence requires a supported secret-delivery design and native qualification. Do not give engines AWS roles or silently relocate secrets to ordinary files to satisfy a wording goal.

### F05 — GuardDuty is an independent collection and copying boundary

Live reads show enabled Runtime Monitoring and foundational account/DNS/flow analysis in all maintained regions. The four running hosts report HEALTHY coverage, agent v1.17.3. Account-wide EC2 automatic agent management is enabled in NVA; selected-host inclusion supports the other deployments. Disabled fleet-wide enrollment elsewhere is not proof that those hosts are unmonitored.

AWS documents [runtime collection](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring-collected-events.html) of process arguments, DNS payloads and connection endpoint metadata. Ordinary decrypted DNS crosses the host bridge before DoT. Actual export of every forwarded Ghostline lookup, especially the translated port-5353 path, remains unverified. This is a documented capability and collection risk, not proof that AWS retained every hostname or decrypted HTTPS content.

Foundational GuardDuty [independently consumes flow and account activity](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_data-sources.html); it does not require customer-configured flow-log resources. Cloudflare/Google DNS bypasses its Route 53 Resolver DNS source for those questions, while host/control-plane lookups can still use AWS DNS. Removing Runtime Monitoring would not eliminate foundational endpoint analysis.

GuardDuty findings are [retained for 90 days](https://docs.aws.amazon.com/general/latest/gr/guardduty.html). That is a finding lifetime, **not** a verified raw-runtime-event retention period. No publishing destination, delegated administrator or GuardDuty-source EventBridge rule was found in the five-region checks. Security Hub returned `InvalidAccessException`; its integrations remain unverified rather than being declared absent. Detective returned no graphs in four regions; Zurich's query was unavailable.

EBS malware protection is enabled. All five detectors report `EbsSnapshotPreservation: NO_RETENTION`, but a triggered scan can still snapshot disks and create a service-account replica. AWS describes [replica retention up to 55 hours, or seven days for service failures](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_malware_protection-ebs-volume-data.html). Thus a disk trace could be copied outside the host even without a user-retained snapshot. The authorized follow-up confirms a historical completed clean scan of two volumes on a documented Stockholm host, with snapshot references. No scan was initiated for this audit. Exact historical snapshot contents remain unverified.

**Current decision:** the four active gateways adopted the approved launch-time Runtime Monitoring opt-out. Keep both volumes eligible for agentless EBS malware scanning. Available evidence supports continued review of journal, error and dump paths. Selective disk exclusions remain a separate decision if sensitive material is found there. [GuardDuty controls](guardduty.md#privacy-control-granularity--november-17-review).

AWS also offers a [service-improvement opt-out](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-opting-out-using-data.html). Its current documentation says command/argument and detected-malware data are not presently used for that purpose, while describing possible future use. Effective account/organization opt-out state was not inspected. Opting out would not stop ordinary threat-detection collection.

### F06 — CloudWatch holds control-plane logs, not the configured gateway traffic stream

Each maintained region has four release log groups: release gate, deployment hook, email-subscription handler and CDK provider framework. [Release logs](../infra/lib/releases/stack.ts) and [notification logs](../infra/packages/notifications/src/index.ts) have seven-day retention and `RETAIN` removal policy. Park does not remove these producers; endpoint shutdown does not stop the regional controller. No subscription filter or account-level subscription policy was found for the current groups, and Lambda tracing is `PassThrough`, not an actively configured X-Ray deployment.

AWS notes that [retention deletion usually lags expiry by up to 72 hours, sometimes longer](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html); events already marked for deletion are excluded from `storedBytes`. A seven-day policy and zero reported storage therefore do not prove immediate physical removal.

The [release handler](../infra/lambda/release-gate.ts) deliberately logs only status. Fixed notification messages avoid forwarding arbitrary events. Lambda still produces invocation/system/error records, and uncaught SDK/runtime errors can expose details. The subscription handler reads a saved email internally and uses an opaque physical identity. The pinned [CDK provider framework](https://github.com/aws/aws-cdk/blob/v2.268.0/packages/aws-cdk-lib/custom-resources/lib/provider-framework/runtime/framework.ts) can log resource event/response metadata, with `ResponseURL` sanitized. Its input contains a parameter reference, not a plaintext email. Do not label it secret-free solely because custom code lacks `console.log`.

This audit did not read CloudWatch event contents. The storage/count inventory proves groups and retention, not their complete redaction. The current ECS tasks have no `awslogs` driver; **the confirmed configured traffic-log path is local Docker storage**, independently of CloudWatch's relatively small byte count.

### F07 — CloudTrail and SSM preserve administrative identity and activity

The live shared `account-management-audit` trail is multi-region, includes global events, validates log files and logs all management reads/writes. It has no configured data-event selectors or CloudWatch duplicate. Its S3 bucket has seven-day object expiry, no enabled versioning, no replication configuration and no server access logging. Recent delivery was reported. Lifecycle expiry is asynchronous; it is not a cryptographic guarantee that every copy disappears exactly seven days after the recorded API call.

CloudTrail can contain actor identity, source address, user agent, time, resource names, parameter names, API request fields and administrative command text. It is not a general HTTP browsing recorder. AWS's separate [90-day management Event History](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events-console.html) cannot be manually cleared by deleting the S3 objects or trail. The shared baseline intentionally survives Ghostline teardown.

The source uses [SSM Run Command](../infra/lib/ecs-verification.ts) for redacted diagnostics and a [fixed observer document](../infra/lib/releases/host-probe.ts) for readiness. AWS documents [command history for up to 30 days](https://docs.aws.amazon.com/systems-manager/latest/userguide/running-commands.html) and optional [S3/CloudWatch output copies](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-rc-setting-up-cwlogs.html). Commands must never embed secrets; request auditing and host-agent output are independent of the desired log-driver policy.

Selected current-host history contained 272 commands in Oregon, 209 in NVA, 236 in Stockholm and 233 in Zurich. None selected an S3 or CloudWatch output destination. Those counts are snapshots, not lifetime totals; retired hosts are excluded. No matching historical Session Manager session was returned for current hosts. The conventional `SSM-SessionManagerRunShell` preference document was absent in all five regions (`InvalidDocument`), which does not prove that every custom document, old session or host-local SSM log is absent.

#### Authorized shared-bucket content sample

The owner explicitly authorized reviewing shared CloudTrail contents, including possible secret exposure from other applications. The bucket listing contained 20,287 objects, of which 13,522 were CloudTrail log objects totaling 49,610,155 compressed bytes; the rest were not included in the log-content sample. Automatic approval review rejected a full-bucket scan despite that authorization because of the breadth of unrelated private data.

A fixed, approved alternative inspected the **five latest log objects per maintained region: 25 objects, 146,437 compressed bytes and 444 records**, spanning event times 11:04:00–13:06:09 UTC on November 16. Values were processed only in memory, with no raw log files written to disk, event dumps or hashes of secrets retained. The sample is biased toward recent operations, including this audit's own reads; it is not representative proof about deployments or the preceding seven days.

The sample contained 20 `sts:AssumeRole` responses with access-key identifiers and session-token values: 12 attributable to Ghostline by resource/request markers, eight other or unclassified account activity. The fields are `responseElements.credentials.accessKeyId` and `.sessionToken`. No `secretAccessKey` payload or other high-confidence application-secret pattern was detected by the scanner in these records. AWS [explicitly documents this STS logging behavior](https://docs.aws.amazon.com/IAM/latest/UserGuide/cloudtrail-integration.html): responses are logged except for the secret access key. These are sensitive credential fragments and correlation identifiers, but the logged fragments alone are not a complete reusable AWS credential set.

No private-key PEM, WireGuard private/preshared/header-key assignment, supported vendor-token pattern, credential-bearing URL, unredacted SecureString write or secret-named application environment-value pair was detected in the sample. This is a limited pattern-based result, not a guarantee that encoded, custom-format or older secrets are absent. No particular unrelated application was implicated beyond the unclassified STS records. Full-bucket content review remains blocked by automatic approval review; the report does not claim it occurred.

### F08 — Durable release records, queues, email, artifacts and metrics

The five regional `ghostline-prod-release-attempts` DynamoDB tables have TTL disabled and are retained. [State writers](../infra/lib/releases/state.ts) persist lifecycle, rollout, host/probe/image identities and alert receipts. They do not deliberately store browsing destinations, but some records survive indefinitely. PITR is disabled; normal DynamoDB service backups are distinct from PITR and were not treated as a data-erasure guarantee.

Each region has a retained, encrypted SQS failure queue with 14-day message retention. Oregon reported approximately two visible messages, the others zero; no body was read. EventBridge/Lambda failure payloads can preserve control-plane event/request/error information. No EventBridge archive was found in the five maintained regions. SNS has no configured delivery-feedback logging or archive policy on the selected Ghostline topic, but subscriber identities, delivery systems and copies in email inboxes are additional durable records. Fixed alert text limits content; it does not erase ownership or time.

Five named Ghostline asset buckets have no lifecycle configuration; two historical Ghostline audit buckets have seven-day expiry. These seven buckets have no configured server access logging, versioning or replication. Asset/release storage holds templates, code, image manifests and provenance rather than user browsing by design. A payload mistake can persist; object contents were not inspected. ECR images, task definitions, CloudFormation templates/events and SSM parameter versions also have lifetimes separate from the host. The release policy intentionally retains production/history.

Basic EC2, ECS, Lambda, queue and alarm metrics can reveal service use and volume/time patterns even without packet records. CloudWatch [retains aggregated metrics up to 15 months](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html). Detailed EC2 monitoring being disabled does not disable basic metrics. No custom per-client/destination metrics were found in the source reviewed; metric time series and alarm history were not downloaded.

### F09 — Local and client records outlive the gateway

Metadata-only inspection of the primary checkout's ignored artifacts found:

| Directory under `~/code/ghostline/.local/` | File count | Relevant types; contents not examined |
| --- | --- | --- |
| `recovery/` | 292 | 58 JSON, 58 CONF, 84 VPN links, 82 QR PNGs, plus other files |
| `deployments/` | 382 | 322 JSON, 36 OUT, archives, scripts and a CONF |
| `benchmarks/` | 271 | Journals/results, source, output and browser/code archives |
| `diagnostics/` | 529 | 179 LOG, 227 JSON, crash/panic/IPS/DIAG files, database and archives |
| `releases/` | 446 | Metadata/bundles, 34 LOG and 9 OUT files |
| `region-init/`, `region-purge/`, `account-security/` | 11 combined | Operation/checkpoint metadata |

File counts do not prove sensitive contents. The observed CONF/VPN/PEM/KEY extension subset had no group/other permission bits; this check did not validate all credential-bearing JSON/PNG files, parent directories, ACLs, backups or synced copies.

[Profile exports](../infra/scripts/ecs.ts) persist usable credentials deliberately. [Client tests](../infra/lib/ecs-client-test.ts) also create protected temporary files, while [benchmark journals](../infra/lib/benchmark/model.ts) retain campaign URLs, timestamps, measurements and exit identities. [Browser checks](../infra/lib/benchmark/browser.ts) suppress page content, screenshots/traces and raw navigation errors, but that does not remove the selected canary URL from the private campaign journal. Some source/image tests use synthetic credentials; their artifacts should not be conflated with production exports.

Native OneXraySE/Amnezia profiles, application logs, macOS unified logs, crash reports, browser history/cookies, DNS caches, clipboard history, terminal output/history, Docker Desktop's VM, Time Machine and any synchronization/backup copies require a separate device audit. The current local counts include some crash artifacts but do not qualify device-wide erasure. The audit itself and agent conversation are also records; no secret values were included in them.

### F10 — ISP, provider, resolver and destination tracking remains possible

This is an architectural exposure assessment, not a claim that a named ISP or destination is currently retaining a particular field. No provider-internal retention policy, subscriber record or browser-leak test was independently audited.

On the gateway-to-site leg, HTTPS also need not hide the hostname: a TLS ClientHello can expose SNI unless Encrypted Client Hello is successfully used. [RFC 9849](https://www.rfc-editor.org/rfc/rfc9849.html) describes that boundary. ECH use was not checked here. Plain HTTP exposes its application data on that leg. A correctly captured full tunnel hides those inner exchanges from the access ISP, but they become relevant again at the AWS exit/transit boundary.

| Observer | What remains visible or linkable | What the tunnel/HTTPS can protect |
| --- | --- | --- |
| Access ISP, carrier, hotel/Wi-Fi operator | Subscriber/device access identity; AWS endpoint address; connection time/duration, bytes and packet sizes/timing. Transport fingerprinting or classification remains possible. Retention is provider-specific and unknown here. | With correctly captured traffic, inner destination requests and ordinary DNS are encrypted on this leg. Split routing, disconnect fallback, IPv6 or DNS escape can expose more. |
| AWS and networks near the exit | Account/resource/EIP ownership; ingress client endpoint and egress destination addresses, ports and timing; on-host security telemetry and authorized disk access. One provider can potentially correlate both sides. | Application HTTPS protects its plaintext content from passive transit observers; it does not conceal destination IPs or tunnel ownership. |
| Public DNS resolvers | Queried names, query timing and the gateway-side source address; answers and resolver metadata. Health probes contact the configured providers too. | DoT protects transport to the resolver, not the question from that resolver. Browser-originated DoH changes which resolver sees it, not the fact of resolver visibility. |
| Destination/CDN/application | Dedicated exit IP, time, URL/content at its own TLS termination, account login, cookies and browser/device signals. The personal exit has little anonymity from unrelated users. | The destination generally sees the gateway address instead of the access address if routing is correct; application identity still links activity. |
| Observer able to watch both ends | Matching timing/volume/connection patterns; fixed exit continuity. | Encryption protects content, but this design has no mixing, cover-traffic or formal correlation-resistance guarantee. |
| Compromised device, host or authorized cloud administrator | Plaintext at a TLS endpoint, available keys/configs, current connection state and any retained records within its authority. | RAM-only retention would reduce later disk evidence, not observation while the system is running or copies already exported. |

Cloudflare's [public resolver policy](https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/) describes limited query/debug logs deleted within 25 hours, with truncated source-address handling, sampled-packet exceptions and longer-lived aggregates. Google's [public DNS policy](https://developers.google.com/speed/public-dns/privacy) describes temporary full-IP/query logs normally retained 24–48 hours, possible security/abuse extensions and longer-lived de-identified records. These are third-party policies, not Ghostline's deletion controls. The Corefile uses Cloudflare first with Google fallback; even non-user health checks can contact configured upstreams.

[DNS privacy considerations](https://www.rfc-editor.org/rfc/rfc9076.html) explain why encryption and resolver trust are different boundaries. [Internet privacy guidance](https://www.rfc-editor.org/rfc/rfc6973.html) distinguishes data minimization, identification and correlation. Applied here, changing regions/EIPs or obfuscating a transport does not by itself remove cookies, account identity, traffic correlation or AWS ownership. REALITY/AWG are useful connectivity/encryption choices; this architecture does not establish anonymity against AWS or a two-ended observer.

Current IPv6 blocking, fail-closed routing, fallback DNS, browser DoH/WebRTC, native client logging and behavior during sleep/wake/disconnect were not requalified. Historical product acceptance is narrower than a guarantee for every current location/device. No new client-side DNS design is selected by this audit.

## Complete identified surface inventory

“Persistent” includes records that exist outside process RAM even if encrypted, rotated or eventually expired. “Not configured” refers to the checked deployment/ownership scope, not to a provider's internal systems.

| ID | Producer / record | Potential sensitive data | Sink and lifetime | Evidence |
| --- | --- | --- | --- | --- |
| L01 | Xray access | Client endpoint → destination, status, time, optional labels | Docker JSON on host data storage; size rotation, no age limit | Live policy + pinned implementation; F01 |
| L02 | Xray errors/startup | Error context, addresses/names depending on code path | Same Docker path | Error logging enabled; actual messages not sampled |
| L03 | Xray DNS/debug/REALITY show/stats | Questions, internal state or user counters if enabled | Would follow selected log/API configuration | DNS logging not enabled; show false; stats/API absent in current parameter |
| L04 | CoreDNS errors/startup | Failed question/type and error context | Docker JSON, current file capped | Source + live driver; F02 |
| L05 | CoreDNS normal query log | Successful/all question records if enabled | No query-log plugin in current Corefile | Source; does not exclude L04 |
| L06 | AWG daemon/tool errors | Interface, peer/error/network context | Docker JSON | Foreground process; no explicit `LOG_LEVEL` in source task. Pinned daemon defaults to error output, not silence; [upstream entry point](https://github.com/amnezia-vpn/amneziawg-go/blob/b5928efb6ca19f0153958460c3d141f04abc5c2e/main.go) |
| L07 | Initializer diagnostics | Fixed failure message; raw configs would be critical | Docker JSON; detailed renderer stderr suppressed | Source and live driver |
| L08 | Network daemon/readiness | Protocol/container topology, exception text | Docker JSON; readiness/state files under private `/run` tmpfs | Source; no deliberate per-flow writer |
| L09 | Bootstrap and OS services | Boot/service/admin/agent context | Persistent system journal and runtime data | Qualified OS source; host size/content unverified |
| L10 | Docker health-check/container state | Health output, exit reasons, timing | Docker metadata on persistent storage | Health checks configured; DNS helper intentionally prints nothing |
| L11 | Kernel/audit/core/panic paths | Process memory, paths, packet/error context depending on failure | Journal, dump/pstore/support files where enabled | No explicit comprehensive dump policy found; live state unverified |
| L12 | ECS/SSM/GuardDuty host agents | Task identities, commands, errors and checkpoints | Host data/journal; security/API backends | Source/platform model; exact host files not read |
| L13 | Initializer environment metadata | Server credentials and allowed client identities | Privileged Docker/ECS metadata; may persist on EBS | Documented architectural boundary; not a proven printed log |
| L14 | Live VPN/DNS/kernel state | Peer endpoints, handshakes, counters, in-flight names/flows | RAM, sockets, conntrack and caches | Necessary runtime state; not a durable history absent another writer |
| L15 | GuardDuty runtime | Process arguments, connection endpoints, potential internal DNS | AWS security telemetry; raw retention not established; findings 90 days | Plan/coverage live; DNS export extent unverified |
| L16 | GuardDuty foundation | Account activity, network endpoints, AWS-resolved DNS | Independent AWS analysis/findings | Enabled live even without customer flow logs |
| L17 | GuardDuty malware scan | Replica of logs/credential metadata already on disk | Conditional snapshots/service-account volumes | Enabled, no retained-snapshot policy; scan occurrence unverified |
| L18 | Customer flow/Resolver query/mirror logs | Network tuples, DNS questions or packets | No matching current Ghostline sink found | 33-region metadata inventory; Bahrain/untagged scope excluded |
| L19 | Release gate/hook Lambda | Status, invocation time, resource/error context | Four groups per maintained region with L20; seven days | Source + live retention/configuration |
| L20 | Email handler/CDK provider Lambda | Subscription workflow/resource references; exception context | CloudWatch; seven days; groups retained | Source + live; raw events not read |
| L21 | Historical benchmark/release Lambda | Probe/deploy times, diagnostics, possible canary context | 21 additional named groups; seven days | Live names/retention; reported bytes zero |
| L22 | CloudTrail S3 and Event History | Operator/service identity, source IP, API requests; STS fragments | S3 seven-day expiry; separate Event History 90 days | Live settings and 444-record sample |
| L23 | SSM Run Command/session | Administrative commands, stdout/stderr, session metadata | Service history, optional sinks, host files | Selected command sinks absent; service history persists |
| L24 | Release state and failed events | Host/release/lifecycle/probe IDs, failure payloads, timestamps | DynamoDB no TTL; SQS 14 days; no current archive found | Live settings; message bodies/table items not inspected |
| L25 | SNS/email | Recipient identity, fixed alert contents and time | Subscription service, email provider and inbox copies | Source + topic logging metadata; receipt/content outside scope |
| L26 | CloudWatch metrics/alarms | Resource activity and aggregate volume/time patterns | Managed metric history, up to 15 months | Basic service behavior; no raw metric queries |
| L27 | S3/ECR/CDK/CloudFormation assets/history | Source/templates/images/config references and provenance | Retained assets/release history; some stores no expiry | Source + bucket metadata; payloads not audited |
| L28 | Parameter Store and versions | Server/device keys, identities, contact | Durable regional SecureStrings | Intentional recovery store; shutdown-independent |
| L29 | Operator artifacts and benchmarks | Exported credentials, URLs, timestamps, crash/debug evidence | Ignored local disk, terminal/session/backups | Source + file metadata only |
| L30 | Native clients and browsers | Profiles, history, cookies, crash/usage/DNS state | Device disk/OS logs and possible sync/backup | Current full-device inventory unverified |
| L31 | DNS providers | Questions and resolver-side source/time | Cloudflare/Google policies, outside Ghostline deletion | Configured providers + published policies |
| L32 | ISP/AWS/transit/destination systems | Subscriber/account linkage, network metadata, site-side identity/content | Other organizations' systems; retention unknown here | Architectural inference; no provider-internal audit |

## What survives each kind of shutdown?

| Action | What can disappear | What survives or remains unproven |
| --- | --- | --- |
| Restart one engine/container | That process's private working memory | Host tmpfs/config, connection state elsewhere, Docker files/metadata, journal and all external records |
| Stop only the gateway task | Engine processes and their active state | Host-mounted config tmpfs is not automatically erased by task exit; disk logs/metadata and external records remain |
| Ghostline `stop` / ordinary EC2 stop | Active task/host RAM ends; hibernation is not configured | EBS volumes retained. Logs/metadata may survive container cleanup or remain as disk traces; all off-host records remain |
| Host reboot | Volatile memory and tmpfs contents | Persistent disk/journal/metadata; bootstrap re-renders/reloads preserved identities; external records |
| Blue-green host replacement / `park` | Terminated host RAM; delete-on-termination volumes are scheduled for deletion | Existing snapshots/copies, cloud histories, retained release resources, parameters, EIPs and local/client artifacts |
| `destroy` | Owned endpoint and release resources according to lifecycle contract | Independent GuardDuty/CloudTrail, deliberately retained credentials, expiring logs/queues, local/device/provider records; exact destroy receipt governs |
| Delete/expire a log object | That accessible object/version subject to the service's deletion behavior | Prior exports, integrations, caches/backups, provider-internal handling; no retroactive deletion from another party |

Disk encryption protects against some offline access. It does not make a running host's authorized reads, AWS-managed telemetry, retained snapshots or authenticated account access disappear. Nor does RAM-only storage guarantee that an already-compromised host/provider did not copy data before shutdown. “Gone forever” requires a much narrower, testable claim than “the VM stopped.”

## Recommended remediation and acceptance gates

The [proposed remediation plan](../.context/scratch/2026-11-16-logging-privacy/remediation-plan.md) expands these recommendations into work units, suggested policy choices and acceptance tests for discussion. It does not authorize implementation or change the dated audit findings below.

### First: stop producing client-to-destination history

1. Set an explicit normal-mode Xray logging policy and enforce it centrally. Start with access disabled, DNS logging disabled, REALITY diagnostic output off, and an explicit decision about errors. Verify the exact pinned executable with synthetic successful/rejected connections and DNS activity. Preserve keys, UUIDs, EIPs and client compatibility.
2. Remove per-question CoreDNS failure output in normal mode. Exercise all relevant failure paths with synthetic, unique query markers; verify that no question/client/destination enters any enabled sink.
3. Audit AWG startup/daemon/tool errors, network-daemon exception text and engine crash paths under the same policy. Decide whether normal mode needs fixed non-identifying health/status diagnostics; avoid treating broad stderr suppression as evidence of a complete solution.
4. Ensure regression tests fail if a parameter/config update re-enables access/query logging. Validate every supported regional configuration and the emitted task definitions, not only one template or the source defaults.

These are recommendations for the next implementation unit. No production parameter update, secret rotation or rollout was executed here.

### Second: resolve the platform and security-telemetry boundary

Choose and name the intended guarantee:

| Proposed goal | Fit with the current architecture |
| --- | --- |
| No persistent Ghostline-controlled client/destination/DNS history in normal operation | Plausible after source suppression, host/error-path review and qualification; currently fails |
| Only bounded RAM diagnostics on the gateway | Requires supported logging/dump/metadata changes and native reboot/failure qualification; currently fails |
| No sensitive state anywhere after host shutdown | Incompatible with the current durable credential/recovery stores, AWS history and outside observers |
| Anonymous browsing against AWS, destinations or a two-ended observer | Not established by this dedicated single-provider VPN design, even after application logging is fixed |

Bring back a concrete GuardDuty policy choice: keep the current security visibility and disclose it, or reduce selected-host runtime collection with an explicit detection-loss assessment. Foundational flow analysis and shared CloudTrail must be addressed separately. The documented service cannot be assumed to offer DNS-only redaction. Do not disable shared account controls affecting other applications to improve this project's privacy score.

Investigate supported official Bottlerocket options for volatile diagnostics/dump controls and initializer secret delivery. If the platform cannot meet literal RAM-only requirements, expose that constraint before choosing a different OS/runtime or introducing another collector. The solution must remain compatible with the existing supported-architecture contract unless the owner selects a broader change.

### Third: qualify retention, debug operation and residual handling

Normal operation should minimize what is emitted, not merely shorten storage. Any proposed debug mode should be an explicit operator choice, use synthetic traffic whenever possible, avoid credential/client/destination fields by design, use a bounded RAM sink where supported, expire automatically, and verify restoration to normal mode. A deploy-time flag must not quietly enable persistent logging indefinitely if a CLI dies.

Qualify the final design on an isolated official ECS-3 ARM64 host with synthetic identities and markers:

- Check rendered configs, effective Docker drivers/paths, journal mode, agent output, health metadata, dumps, swap and initializer metadata without exporting production secrets.
- Exercise successful traffic, DNS/transport failures, invalid input, crashes, retries, task replacement, reboot, EC2 stop/start and complete host replacement. Check both normal and debug modes.
- Search the selected local/off-host sinks for synthetic markers, then verify their expected disappearance across the declared lifetime. Deleting an application log while its source still emits it is not a passing result.
- Run targeted behavioral regressions, the full `infra/npm test` gate, package/native qualification where artifacts/platform change, and a fresh regional CDK diff before any authorized release. Recheck deployed behavior after rollout; source tests cannot prove production erasure.
- Review existing local exports/diagnostics, old groups/queues, any snapshots and forwarded copies separately. No historical deletion, mailbox cleanup or device reenrolment is authorized by this audit. Do not promise that removing current records retracts earlier external copies.

## Coverage gaps and follow-ups

1. Actual Docker/journal contents and persistence through stop/reboot were not remotely inspected; effective host dump/checkpoint/agent logging settings remain open. Current parameter controls are not a reread of each rendered RAM config.
2. The audit enumerates identified configured sinks, not every possible vendor-internal log or every stored event. It does not verify complete absence of arbitrary secret encodings or prove secure destruction.
3. Bahrain's metadata APIs did not respond. Ownership discovery uses Ghostline names/tags plus explicit current function mappings; unknown/untagged resources, disabled regions, other accounts and independently copied historical records are not comprehensively covered.
4. The shared-bucket content scan covers 25 recent objects and 444 records. Automatic approval review rejected the 13,522-object scan despite owner authorization. No complete bucket-content or seven-day secret-free assurance is made; digest-chain integrity was not verified during the sample.
5. Security Hub integrations, Zurich Detective availability, provider-held raw telemetry retention, historical malware scans and effective service-improvement opt-out remain unverified.
6. Client/device forensic state, backup/sync copies, native leak/fallback/IPv6 behavior and new-network testing remain separate work. ISP/resolver/destination retention is not under project control.

## CloudWatch log-group appendix

The table below is generated from live `DescribeLogGroups` metadata, filtered case-insensitively for Ghostline. All listed groups have seven-day retention. Names identify infrastructure, not client activity. The reported storage values are not content assessments.

| Region | Log group | Reported stored bytes |
| --- | --- | ---: |
| `af-south-1` | `GhostlineRelease-EmailLogs8FF0C9F6-DmPS0iJuKA5a` | 0 |
| `af-south-1` | `GhostlineRelease-EmailProviderLogs78952A18-lXI4VURgMHre` | 0 |
| `af-south-1` | `GhostlineRelease-HookLogs289E65C6-ZKKmPpnB5T6f` | 0 |
| `af-south-1` | `GhostlineRelease-Logs6819BB44-BjymIKViPGnC` | 95,506 |
| `ap-south-1` | `GhostlineBenchmark-mumbai-lifecycle-probe-Logs6819BB44-eyEqyM0AqVEq` | 0 |
| `ap-south-1` | `GhostlineBenchmark-nearby-round-two-main-probe-Logs6819BB44-ltaaqovNbzgO` | 0 |
| `ap-south-1` | `GhostlineBenchmark-openness-mumbai-probe-Logs6819BB44-bBRcFvpfpgo9` | 0 |
| `ap-south-2` | `GhostlineBenchmark-nearby-round-two-main-probe-Logs6819BB44-21yjOeP76w21` | 0 |
| `eu-central-1` | `GhostlineBenchmark-frankfurt-lifecycle-probe-Logs6819BB44-auAxN7hkRk5j` | 0 |
| `eu-central-1` | `GhostlineBenchmark-frankfurt-recheck-probe-Logs6819BB44-5IqvZykjT83o` | 0 |
| `eu-central-1` | `GhostlineBenchmark-nearby-round-two-main-probe-Logs6819BB44-dZfXi2O7QsyG` | 0 |
| `eu-central-1` | `GhostlineBenchmark-stockholm-frankfurt-v2-probe-Logs6819BB44-uBQuD3TlChdC` | 0 |
| `eu-central-1` | `GhostlineRelease-EmailLogs8FF0C9F6-Huu6074ZMg3A` | 0 |
| `eu-central-1` | `GhostlineRelease-EmailLogs8FF0C9F6-JDEUeupuLssa` | 0 |
| `eu-central-1` | `GhostlineRelease-EmailLogs8FF0C9F6-dJ8Km9986tJe` | 0 |
| `eu-central-1` | `GhostlineRelease-EmailProviderLogs78952A18-72DPCoqtspXY` | 0 |
| `eu-central-1` | `GhostlineRelease-EmailProviderLogs78952A18-bYK5bzoAvl7f` | 0 |
| `eu-central-1` | `GhostlineRelease-EmailProviderLogs78952A18-tkwmCqrd2y1i` | 0 |
| `eu-central-1` | `GhostlineRelease-Logs6819BB44-NKCSU4DdRzxU` | 0 |
| `eu-central-1` | `GhostlineRelease-Logs6819BB44-RevHiK6bOsfX` | 0 |
| `eu-central-1` | `GhostlineRelease-Logs6819BB44-d8O7Dh0dSorg` | 0 |
| `eu-central-2` | `GhostlineRelease-EmailLogs8FF0C9F6-TbTz6859ydiv` | 0 |
| `eu-central-2` | `GhostlineRelease-EmailProviderLogs78952A18-TYkXrmvuNStK` | 0 |
| `eu-central-2` | `GhostlineRelease-HookLogs289E65C6-VG6fjq9jlOS9` | 0 |
| `eu-central-2` | `GhostlineRelease-Logs6819BB44-4PREwanlZOkR` | 104,750 |
| `eu-north-1` | `GhostlineRelease-EmailLogs8FF0C9F6-pk6ZH2lhVSH4` | 0 |
| `eu-north-1` | `GhostlineRelease-EmailProviderLogs78952A18-iT309CLrbU2j` | 0 |
| `eu-north-1` | `GhostlineRelease-HookLogs289E65C6-KKaMMMPGvJH3` | 0 |
| `eu-north-1` | `GhostlineRelease-Logs6819BB44-BswRRgEh1Il5` | 102,216 |
| `eu-south-1` | `GhostlineBenchmark-nearby-round-two-main-probe-Logs6819BB44-ytVMklDpTqkb` | 0 |
| `eu-south-1` | `GhostlineRelease-EmailLogs8FF0C9F6-xUeZ5pNJh3iW` | 0 |
| `eu-south-1` | `GhostlineRelease-EmailProviderLogs78952A18-t2P7fciyrNdE` | 0 |
| `eu-south-1` | `GhostlineRelease-Logs6819BB44-3W1YkUjf55xq` | 0 |
| `us-east-1` | `GhostlineRelease-EmailLogs8FF0C9F6-svCxlUDgEn82` | 0 |
| `us-east-1` | `GhostlineRelease-EmailProviderLogs78952A18-ZlOfdSJ9hmLG` | 0 |
| `us-east-1` | `GhostlineRelease-HookLogs289E65C6-cOKHLDFJ4de5` | 0 |
| `us-east-1` | `GhostlineRelease-Logs6819BB44-at5spcqfTLgs` | 103,937 |
| `us-west-2` | `GhostlineRelease-EmailLogs8FF0C9F6-fK09Eul2IFLJ` | 0 |
| `us-west-2` | `GhostlineRelease-EmailProviderLogs78952A18-D13wjKYshmNn` | 0 |
| `us-west-2` | `GhostlineRelease-HookLogs289E65C6-BenZeGS1Y7YE` | 0 |
| `us-west-2` | `GhostlineRelease-Logs6819BB44-OdRiyE341Vt9` | 103,064 |

## Audit verification

Passed the documentation/evidence gate: 613 local links and 208 heading anchors across 69 Markdown files; JSON consistency against all 34 regional entries, 41 log groups, four active task/image/GuardDuty configurations and the 25-object/444-record sample; 32 surface-inventory rows; clean diff whitespace; and zero matches for the checked credential/contact payload patterns across pending additions and untracked deliverables. Pattern scans are not a general proof that arbitrary sensitive data is absent.

No executable source, dependency, image or infrastructure template changed; the runtime test suite was not rerun for this documentation/evidence-only audit. Previously passing tests and native acceptance remain historical evidence, not validation of a no-logging property.

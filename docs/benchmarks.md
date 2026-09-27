# Regional openness and streaming benchmarks

The benchmark runs from the owner's Mac over home Wi-Fi. It compares the existing Stockholm gateway with disposable regional gateways using the same qualified release and host size. A region must first pass a lightweight, non-VPC Lambda browser probe before the runner provisions a gateway or enrolls its registry. Lambda and EC2 addresses differ, so each actual VPN exit must pass again.

## Commands and private input

Use Node 24 in `infra/`, `npm ci`, and `npm run benchmark:install-browser`. Browser binaries and all campaign state remain under ignored `.local/`. AWS uses profile `personal`; Docker Desktop must be available. Disconnect native VPN routing before local tunnel measurements and restore the previous connection afterward. `scutil` alone is insufficient for OneXraySE; the runner checks the actual route.

Create a mode-0600 JSON file under `.local/benchmarks/` with `id`, `source` (normally `stockholm-ecs`), an ordered `regions` array, optional `rounds` (default two, maximum three), and `canary` containing `url`, `expectedText`, and optionally `requiredSelector`. Keep sensitive destinations out of committed examples. Use content landmarks that identify a usable page, not just its brand or title.

```sh
npm run benchmark plan ../.local/benchmarks/campaign.json
npm run benchmark run ../.local/benchmarks/campaign.json
npm run benchmark status campaign-id
npm run benchmark resume campaign-id
npm run benchmark cleanup campaign-id
```

`plan` checks live account/region availability without deploying. `run`/`resume` write private atomic checkpoints and sanitized results. A campaign ownership receipt prevents other local deployment/publication CLIs from reconciling an outdated registry catalog. Resume or clean up the same campaign before starting another. Stop at an operational error; do not remove the receipt to bypass uncertain cleanup. Cleanup can hand off only its own dead deployment child after CloudFormation has settled; foreign/running claims remain protected. Campaign-labeled local client containers and RAM volumes are reconciled on resume; never remove unrelated Docker resources.

## Execution and evidence

1. Deploy only the temporary probe function, private code bucket and minimal logging role. Use one 60-second browser invocation and one retry for uncertain results; remove the probe and code bucket afterward. No VPC/NAT, host, EIP, ECS or ECR membership exists at this stage.
2. Only a confirmed `pass` proceeds. Explicit geographical restrictions/identity gates are `restricted`; bot challenges, unrecognized pages and ordinary 403s are `inconclusive`. Transport failures remain separate. The probe uses standard Chrome HTTP identification with the actual engine/OS/version: the tested site rejected the headless product token alone. It never solves challenges or imports personal browser cookies. Lambda uses one context per invocation for its single-process browser; normal web-origin, mixed-content and TLS checks remain enabled. The ephemeral function has logging permissions only and no application credentials. These outcomes describe an observed address/browser, not an entire country's law or general internet openness.
3. Freeze the candidate cohort and production release upfront. Complete **all** openness probes before provisioning **any** gateway. Then privately copy source credentials, enroll/seed the release and deploy every passing candidate sequentially. All candidates remain ready throughout measurements; provisioning and registry writes never run concurrently. Production is a measurement participant, never a cleanup target. Prepare all client images, profiles and the shared download fixture before the first timed block. Reuse the object and refresh its signed URL without another upload.
4. Run one protocol across all ready regions before switching protocols. Two rounds default to REALITY then AWG with source-first region order, followed by AWG then REALITY with reversed region order. Three 30-second direct samples calibrate each protocol/round block; bracket every 30-second VPN sample with 30-second direct controls and supporting router probes. Preserve each result; no hot retry overwrites evidence. Calibration MAD above 15% defers validity; before/after variation remains bounded between 20% and 30%. Direct tests include Wi-Fi, ISP and provider effects, not Wi-Fi alone.
5. Use identical browser streaming-byte accounting for direct, REALITY and AWG paths against Cloudflare's download endpoint. Count delivered chunks from unfinished responses at the deadline, divided by the monotonic elapsed window. This removes the old completed-5-MB quantization. Each sample has a 512 MiB cap; reaching it finishes early and is recorded (a received chunk may exceed the accounting cap). Record CDN edge codes and HTTP idle/loaded response latency; this is application latency, not an isolated network RTT. Require matching valid protocol/round samples, with their full observed spans within fifteen minutes, and at most 20% spread across their direct controls before comparing raw throughput. Reject control windows extended by a suspended controller (three minutes for speed/confirmation, five for streaming). Use small cohorts if the fifteen-minute comparison limit would otherwise be exceeded. A greater-than-20% advantage repeated across both rounds supports a provisional leader; do not normalize away a weak connection or rank deferred samples.
6. A 50 Mbps screen targets headroom for a modeled 25 Mbps stream; falling below it is not proof that ordinary video playback will fail. Confirm poor results against a private encrypted London S3 fixture before elimination, with their own direct controls. Prepare this fixture only after the openness gate and before timed work. Its 12,500,000-byte incompressible object models four seconds of media. Qualified region/protocol combinations receive a three-minute streaming check while their existing gateways remain ready. Presigned GET URLs grant temporary access to this one object; treat the complete URLs as sensitive and keep them out of reports and logs. Model an eight-second initial buffer and twenty-second maximum buffer; include unfinished final requests in the observation window. These are modeled underruns, not native-player observations.
7. After all measurement blocks and qualified streaming checks, destroy **all owned candidate gateways**, retire their registry memberships and remove fixture objects/buckets. Never redeploy a candidate just for deeper tests. On failure, checkpoint cleanup before deleting anything; resuming that phase only cleans up. A failed campaign requires a new identifier for another run. An interrupted measurement block remains recorded as incomplete and is repeated in full on resume; completed blocks remain intact. Never destroy maintained gateways or NVA/London publishers.

Reports include actual running application image digests, browser version, measurement times, instance type/launch AMI and available CloudWatch CPU/credit samples. Delayed or denied metrics remain unknown, not zero; launch AMI is not proof of the current in-place OS version. A measured CPU maximum at or above 85% defers capacity attribution. Short samples do not establish sustained burst capacity or rule out client/host contention.

Private `journal.json` includes the canary and exact ownership; `results.json` and `summary.md` omit sensitive URLs, content and secrets. Standard regional credentials, expiring logs, GuardDuty and independent account CloudTrail deliberately survive gateway destroy. Shared controls can continue costing money. No automatic primary cutover occurs.

The desktop apps are not driven repeatedly by the measurement loop. Both protocol paths use the same browser, with REALITY SOCKS and an unprivileged SOCKS adapter in the isolated AWG namespace. AWG's test namespace permits only the tunnel, its endpoint transport and proxy response traffic. Client-pause checks verify that new HTTPS requests cannot fall back to a direct path. This is not proof of native macOS/iOS DNS, WebRTC or IPv6 leak behavior; those remain finalist acceptance checks.

## Qualification

`npm test` includes model, ownership, phase-ordering and minimal-stack assertions. `npm run test:benchmark` runs actual Chromium against local synthetic pages/downloads, checking classification, measurement deadlines, byte caps and streaming pacing. Explicit live scripts under `infra/test/benchmark-*.integration.ts` qualify minimal probes and existing gateway clients; they are not run by the offline gate.

Consult the current [handoff](../.context/handoff.md) for live evidence and limitations. A passing local gate does not establish site openness, regional performance or complete live lifecycle qualification.

## References

- [AWS Lambda networking](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html): default public internet access requires no customer VPC or NAT.
- [Fetch streaming and cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch): response-body chunks and abort signals underpin bounded byte accounting. Cloudflare is the public download origin; the former speed-test package is no longer used.
- [Chromium for serverless environments](https://github.com/Sparticuz/chromium): pinned Lambda browser packaging; runtime binaries are CDK assets, not gateway release images.
- [Playwright networking](https://playwright.dev/docs/network): isolated browser contexts, proxy routing and request observation.

## Qualification checkpoint

September 27: the minimal Frankfurt probe, full disposable gateway deployment, both protocol access/egress checks, automatic destroy and repeated cleanup passed. Stockholm also passed both protocol canaries. Variable direct controls deferred all speed comparisons; no performance winner or native playback result is established. Router ICMP did not reply. The deeper streaming path passes local browser fixtures but still needs a stable live finalist. Exact evidence and deliberately retained resource classes are in the [handoff](../.context/handoff.md#regional-benchmarking--september-27-qualification-checkpoint).

A second round completed both protocols in Milan, Zurich and Frankfurt, plus Stockholm, with all trial/fixture resources cleaned up. It found no clear improvement and exposed a control-resolution limitation: ten-second controls count completed 5 MB transfers, roughly 4 Mbps steps. That historical method is superseded by the cohort/streamed-v2 workflow above; do not reinterpret deferred samples as a regional ranking. [Recorded results](../.context/scratch/2026-09-27-regional-benchmark/round-two.md).

The coordinated Stockholm/Frankfurt head-to-head completed two reversed rounds with continuous byte accounting. Six of eight overall samples were deferred; the two valid individual results were below the streaming screen. No matched regional comparison qualified and no primary change is supported. [Results and final-source qualification limits](../.context/scratch/2026-09-27-regional-benchmark/head-to-head.md).

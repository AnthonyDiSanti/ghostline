# Regional benchmark implementation checkpoint

Status: September 27, implementation and first disposable full-lifecycle qualification complete; performance ranking remains inconclusive. The current executable contract is [docs/benchmarks.md](../../../docs/benchmarks.md); this checklist replaces the earlier exploratory proposal.

## Selected scope

- Optimize Dubai home Wi-Fi video buffering, starting with nearby AWS regions and comparing REALITY and AWG. No wired test peer exists; direct internet controls plus router probes cannot isolate Wi-Fi from the ISP.
- Run minimal regional Lambda browser openness checks **before** any gateway, EIP or registry deployment. Require usable content; restrictions, challenges and transport failures remain distinct. Only an observed pass advances.
- Use a private campaign catalog, the common qualified Bottlerocket/t4g.small recipe, existing credential identities, a fully provisioned candidate cohort and the common complete destroy path. Keep Stockholm/Cape Town and retained publishers intact.
- Use 30-second Cloudflare download screens per protocol, bracketed by 30-second streamed-byte direct controls. Confirm weak results with a private temporary London S3 fixture. Target 50 Mbps headroom for a 25 Mbps stream; deepen qualifying region/protocol combinations with three-minute modeled streaming trials.
- Retain exact ownership/checkpoints and aggregate results under ignored `.local/benchmarks/`. Never retain private page content, credentials or signed URLs in reports. Preserve ordinary credentials, expiring telemetry and shared account security after destroy.
- Isolated clients prove encrypted egress and no direct fallback during the controlled failure check. Native-device DNS/IPv6/WebRTC and actual playback acceptance remain separate; no automatic primary cutover.

## Completed evidence

- Full local gate: 349 tests in 52 files plus typecheck, fixture checks and fresh offline synth. Native Chromium fixtures verify classification, byte/deadline limits and streaming pacing.
- Mumbai minimal probe deployed and cleaned up, initially returning inconclusive HTTP 403. No gateway was provisioned for that result.
- Both existing Stockholm isolated clients passed egress and pause/recovery checks. Their first neutral samples were approximately 24/12 Mbps, but direct controls varied 28–44 Mbps: do not rank protocols from this qualification run.
- Owner confirmed the private test site loads normally in a regular browser over Stockholm. A bounded A/B test found default HeadlessChrome identification returned 403 while standard Chrome identification with the same engine/OS/version returned 200 and the expected landmarks. The shared browser probe now explicitly uses ordinary Chrome identification; it does not solve challenges, import browser cookies or change TLS validation.
- Bahrain control-plane access timed out before resources were created. This is not a regional openness result.

## Live lifecycle result and next acceptance

- Corrected Frankfurt Lambda probe passed before regional infrastructure deployment. Both actual VPN exits passed openness, encrypted egress and controlled client pause/recovery. GuardDuty reached HEALTHY; temporary diagnostics were disabled and lockdown verified. No production image or gateway was redeployed.
- Automatic destroy and repeated cleanup passed. Independent audit found no remaining application stacks/repositories/hosts/disks/EIPs/VPCs/functions/rules/alarms/DynamoDB state/exclusive assets. Four permanent registry members remain; Frankfurt is retired. Retained classes: seven Standard parameters, five seven-day log groups, one expiring dead-letter queue and shared security. Private evidence is linked in [handoff](../../handoff.md#regional-benchmarking--september-27-qualification-checkpoint).
- Exact local orphan-container/RAM cleanup passed live and preserved an unrelated control container. Interrupted lifecycle-claim handoff is regression-tested, not a live killed-deployment claim.
- Both Stockholm and Frankfurt speed comparisons were deferred because direct controls varied materially. Router ICMP had no replies. No winner, protocol preference or Wi-Fi-specific diagnosis is supported.
- Final source passed 349 tests/52 files and native browser fixtures. The running campaign predated final host-telemetry/reporting and protocol-unavailable refinements; those are locally verified rather than claimed in that live campaign.
- Next: obtain stable paired samples, then exercise the private S3 fixture and three-minute finalist workload live. Broader repeated-window comparisons and native playback establish the recommendation. No region passed the screen in this qualification run, so deep streaming was correctly skipped. Preserve the current production endpoints until a separate cutover decision.

## Second-round outcome

The completed [September 27 second round](round-two.md) tested Stockholm, Milan, Zurich and Frankfurt through both protocols, with no clear improvement established. All trial/fixture resources are removed. Before another regional sweep, qualify improved short-control accounting on existing Stockholm; the notes distinguish real observed variability from the coarse completed-transfer measurement limit.

## References

- [Playwright browser modes](https://playwright.dev/docs/browsers#chromium-new-headless-mode): full Chromium's supported headless mode differs from headless shell; use the same worker for paired protocol measurements.
- [Fetch streaming and cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch): count partial response-body chunks within a fixed window; abort outstanding transfers at the deadline.
- [EC2 network bandwidth](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-network-bandwidth.html): short, newly launched-host samples do not establish steady-state burst capacity.

## Coordinated cohort amendment

The owner selected all-region pre-probes, then upfront sequential provisioning of every passing candidate, followed by protocol-major, order-balanced measurement rounds. Keep gateways until all measurements finish. The current implementation adds streamed-v2 byte accounting and durable cohort/cleanup phases. The [Stockholm/Frankfurt head-to-head](head-to-head.md) completed all eight samples and cleanup; historical round-one/two results remain unchanged. Final local gate passes 357 tests/53 files and native Chromium fixtures. No matched regional winner or streaming qualifier emerged; investigate the repeated control drop before another broad sweep.

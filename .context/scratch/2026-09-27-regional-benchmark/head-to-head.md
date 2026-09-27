# Stockholm versus Frankfurt — coordinated cohort

September 27, 2026. Two protocol-major rounds, with region and protocol order reversed in the second round. Frankfurt passed the minimal openness gate before its gateway was provisioned. Both gateways were ready before measurement; no production deployment changed. All eight real encrypted-client egress/pause/recovery checks and VPN-exit canaries passed. The release identity stayed `sha256:013a8b63b7e93b25312ea3d296ec6378ccd6e13c3c4be91baf8439be56ed8d07`.

## Observations, not a regional ranking

| Round | Protocol | Stockholm Mbps | Frankfurt Mbps | Matched comparison |
| --- | --- | ---: | ---: | --- |
| 1 | REALITY | 20.49 | 19.59 | Inconclusive: controls |
| 1 | AWG | 13.67 | 15.98 | Inconclusive: controls |
| 2 | AWG | 8.79 | 16.20 | Inconclusive: Frankfurt confirmation controls |
| 2 | REALITY | 20.68 | 19.43 | Inconclusive: Stockholm controls |

Two individual measurements retained valid overall controls: Stockholm AWG in round two (independent S3 14.39 Mbps) and Frankfurt REALITY in round two (S3 20.00 Mbps). Frankfurt AWG's initial round-two screen passed, but the independent check (14.45 Mbps) had unstable controls, so its overall outcome was deferred. Neither valid result met the selected 50 Mbps headroom screen, so three-minute streaming was skipped. This threshold is a screening choice, not a minimum for ordinary video playback. No native player, iPhone or comprehensive native-device leak acceptance is inferred.

The failed controls do not mean every VPN reading was erratic. REALITY repeated at 20.49/20.68 Mbps in Stockholm and 19.59/19.43 Mbps in Frankfurt, and exceeded AWG in every same-region round. Frankfurt AWG repeated near 16 Mbps against Cloudflare, but the two regions were nearly equal against S3 (14.39/14.45 Mbps). These are useful observed tendencies, not controlled proof of a universal protocol or regional advantage. For example, Stockholm REALITY's first direct controls fell from 27.06 to 20.19 Mbps around a 20.49 Mbps tunnel sample. The actual tolerance was 20% for these blocks; this conservative heuristic rejected the roughly 25% decline, not the tunnel's repeatability.

Every main sample's direct before-control was faster than its after-control. The three-sample calibration also repeatedly began faster, then settled near 20 Mbps. This is a pattern to investigate, not proof of Wi-Fi instability, ISP shaping, a startup burst or a measurement defect. Direct samples always observed Cloudflare DXB; tunnel samples observed ARN/FRA as expected. Router ICMP had no replies. Available server CPU maxima were below 8%; missing short-window metrics remain unknown.

Continuous byte accounting fixes the previous completed-5-MB quantization, including unfinished response tails; it does not eliminate real variability or make a failed control comparison valid. This run supplies no clear evidence that moving primary to Frankfurt would improve buffering. Keep production unchanged. Before another broad deployment sweep, investigate the repeated before/after pattern with a bounded time-series/settling experiment on the existing connection; do not loosen thresholds or normalize away poor throughput.

## Implementation and evidence limits

The live campaign exercised all-candidate gateway readiness, shared block calibration, two reversed rounds, both real protocols, independent confirmation and automatic cleanup. During the run, the shared S3 fixture was still created on first use. The final source moves fixture/object/client preparation before all timed blocks and caches the signed URL without uploading between samples. That final ordering/cache refinement and the added suspended-control-window/explicit-cleanup retirement guards have focused regression coverage; this live run predates those refinements. Full final verification: 357 tests in 53 files, typecheck, fixture checks and fresh synth; native Chromium partial-response/deadline tests also pass.

Automatic cleanup and repeat cleanup passed. Independent audit found no remaining Frankfurt application stacks, repositories, live hosts, EIPs, disks, VPCs, functions, rules, alarms, DynamoDB state or exclusive asset buckets. Campaign buckets and the London fixture stack are absent. Four permanent registry members remain with no incoming/outgoing Frankfurt rule. Seven Standard parameters, seven-day logs, expiring dead letters and shared security deliberately survive. Both production hosts, EIP allocations/associations and selected release digests match the preceding campaign's audit. No benchmark Docker containers/RAM volumes or active ownership receipt remain. OneXraySE remains Disconnected in the app and scutil, with en0 routing; no native-client setting or connection change was made.

Private evidence: `.local/benchmarks/stockholm-frankfurt-v2/{journal.json,results.json,summary.md,cleanup-audit-eu-central-1.json,final-audit.json}` and the temporary target's `regional-cleanup.json`. Never commit the private canary, signed URLs, profiles or raw page content.

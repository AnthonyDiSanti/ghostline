# Regional benchmark round two — September 27

No clear performance improvement over Stockholm was established. These are the final retained raw samples, **not a validated ranking**: every overall comparison was deferred because its calibration or paired direct controls failed the fixed stability rule. No scoring rule was changed during the campaign. Keep the current primary; this does not establish Stockholm as the best possible UAE exit.

| Region | Protocol | 30-second screen (Mbps) | Independent S3 (Mbps) | Overall result |
| --- | --- | ---: | ---: | --- |
| Stockholm | REALITY | 17.3 | — | unstable-controls |
| Stockholm | AWG | 14.7 | — | unstable-controls |
| Milan | REALITY | 18.7 | — | unstable-controls |
| Milan | AWG | 17.3 | 18.7 | unstable-controls |
| Zurich | REALITY | 18.7 | 20.2 | unstable-controls |
| Zurich | AWG | 12.0 | — | unstable-controls |
| Frankfurt | REALITY | 16.0 | 19.9 | unstable-controls |
| Frankfurt | AWG | 17.3 | — | unstable-controls |

Milan, Zurich and Frankfurt passed the lightweight regional canary and both actual VPN-exit browser checks. Both encrypted clients passed their controlled pause/recovery checks. Mumbai and Hyderabad returned HTTP 200 without expected content: inconclusive, not proof of geographic censorship, and no gateways were deployed. Bahrain's regional control-plane API timed out before any resources were created; no openness result exists there.

Some initial pairs passed (Milan AWG, Zurich REALITY and Frankfurt REALITY), but their independent-download control pairs were unstable. Independent downloads were approximately 19–20 Mbps and did not show a large hidden advantage against a second origin. No candidate advanced to the three-minute streaming stage. That is not a measured inability to stream: modeled/native playback was not tested in this round.

Direct Cloudflare controls varied substantially. A separate bounded direct curl cross-check while no VPN measurement ran also varied (66.4, 27.2, 16.6 Mbps for successive 5 MB transfers). This does not isolate Wi-Fi, ISP, CDN or competing traffic. Router ICMP received no replies. Available host samples were around 5.2% maximum CPU, not evidence of server CPU saturation; other short-window metrics were pending.

A measurement limitation deserves attention before another expensive sweep: the ten-second controls count completed 5 MB transfers, giving roughly 4 Mbps resolution and omitting the in-flight tail. At the observed 16–28 Mbps control rates this can materially affect the stability decision. The independent curl variability means that rounding alone is not an established explanation. Next, qualify longer controls or continuous byte accounting on the existing Stockholm path, repeat in a quieter time window, and separate direct-path variability from tunnel overhead before choosing more regions or dropping a protocol. Do not normalize away slow samples or retroactively loosen this round's criteria.

## Execution and cleanup

The owner paused and resumed the existing controller during Milan cleanup. No second runner was created. Milan, Zurich and Frankfurt completed common destroy and independent absence audits. All campaign probe/fixture stacks and buckets are absent, including the shared temporary London fixture. The campaign is complete and its ownership receipt is removed. Only intended Standard credentials, expiring telemetry and shared security survive. Permanent replication is restored to NVA/London/Stockholm/Cape Town; production endpoint allocations and release identity were freshly verified. Production hosts, endpoints, credentials and release selection were not changed. No native Mac/iPhone playback or leak acceptance is claimed.

Private evidence: `.local/benchmarks/nearby-round-two-main/{journal.json,results.json,summary.md,cleanup-audit-*.json}`, and each temporary target's `.local/deployments/<target>/regional-cleanup.json`. Keep private canary input, page content, profiles and credentials out of committed notes.

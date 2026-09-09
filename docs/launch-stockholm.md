# Stockholm launch evidence

Observed 2026-09-09. Anthony authorized Stockholm as the next primary-exit trial while preserving Cape Town as backup, and requested repeatable regional teardown/redeploy with explicit EIP retention or release. No Cape Town resources or credentials were changed.

## Live deployment

| Item | Value |
| --- | --- |
| Target / account | `stockholm`; profile `personal`, account `757999402784` |
| Region / stack | `eu-north-1` / `GhostlinePoc` |
| Host | `i-033493f9d064f8b00`, `t3.small`, `eu-north-1a` |
| Ubuntu image | `ami-035c8a091035e710a`, Canonical Ubuntu 24.04 x86_64 server build `20260904` |
| Root disk | `vol-00624392e421f4f1a`, encrypted 20 GiB gp3, delete with host |
| ENI | `eni-037352399599d6cc9` |
| Xray TCP 443 | `16.170.38.152`, `eipalloc-0849e55ead905822b`, secondary private `10.77.0.69` |
| AWG UDP 443 / admin | `13.50.178.121`, `eipalloc-0c6fc191dc53dd019`, primary private `10.77.0.13` |
| SSH | Dedicated RSA4096 PEM key; operator `5.195.76.221/32`; host keys pinned from authenticated EC2 console |
| Runtime images | `ghostline-xray:76b2a96fa52395fb`, `ghostline-awg:b36a66191dd0a8bc` |

Both protocols run on one host with independent credentials and distinct ingress/egress. Verified actual configuration bytes, protocol-specific listeners, kernel SNAT and external exit IPs through both containers. Existing Cape Town profiles remain in the Mac app.

## Lifecycle evidence

Initial deployment created host `i-0d240c2580391ef7b`. `park stockholm` removed that empty host, root disk and networking while leaving the same two EIPs tracked in CloudFormation (plus free CDK metadata). `deploy stockholm` created the current host/ENI with new private addresses and reattached the exact same allocation IDs and public IPs. No orphan discovery, resource import, bootstrap stack or additional service was needed.

Each cloud deployment followed a fresh diff; the final Stockholm diff is clean. Final verification passed Node 24 typecheck, all three offline synth targets, 82 tests, git-visible credential scan and 102 local Markdown links. Verified the parked EIPs retained `Project=ghostline`, `Environment=prod`, their protocol `System` tags and exact CloudFormation ownership. The rebuilt root disk has `System=shared`; regional volume inventory contains only that current project disk. The Cape Town diff contains no resource changes, only correction of the informational `SshCommand` output to its existing admin/AWG address; it was not deployed there.

The live park/redeploy experiment happened before installing runtime credentials. It proves resource/IP lifecycle, not an additional installed-runtime restore checkpoint. Cape Town's earlier credential migration already tested restore; Stockholm restoration uses the same bundle installer. The new full-release command has scoped ownership, deletion-order, retry and refusal tests; Stockholm IPs were not released to exercise that destructive path.

## Client checks and interruption

- Mac AmneziaVPN 5.0.1.5 imported fresh Xray through its standard VLESS link. Connected state, actual exit `16.170.38.152`, and Wikipedia HTTPS 200 passed. One HTTPS request took about 1.28 seconds; this is not a sustained performance benchmark.
- Mac imported AWG and identified version 3.1 at `13.50.178.121`. During the later test Anthony reported loss of internet, including unanswered pings to `1.1.1.1`, and disabled the VPN. The subsequent native test returned the direct Dubai IP, so it is **not an AWG pass**. Anthony subsequently authorized guarded native AWG retesting; see the results below.
- Server inspection showed a successful Mac-peer handshake and bidirectional traffic, without exposing peer keys. An isolated Docker client using the same Mac AWG profile then completed a live handshake, received all three `1.1.1.1` pings (about 150 ms after the first), resolved DNS using the configured Cloudflare resolver, and fetched HTTPS with exit `13.50.178.121`. This validates the server and a userspace client from this network; it does not explain or dismiss the native Mac failure.
- Mac was left disconnected; the normal `en0` route via `192.168.128.1` was verified. The diagnostic container was removed. Native profiles are named `Ghostline Stockholm REALITY` and `Ghostline Stockholm AWG`. Cape Town profiles remain intact.
- iOS import/practical trials and owner practical Stockholm performance remain pending; guarded native Mac AWG retesting is recorded below. No new DNS/IPv6 protection or reboot/reinstall claim follows from the isolated probe.

The UI displayed stale Qt screenshots until the window was raised. Automatic review rejected an ambiguous navigation click on the server-setup page; a fresh raised-window screenshot identified the actual Back arrow, then local file import succeeded. No server setup was submitted. VLESS imports treated a trailing newline as `%0A` in the display name; regenerated link files omit that newline, and the Mac label was cleaned up.

## Guarded native AWG retest

Anthony authorized reconnecting and preparing automatic recovery on 2026-09-09. Verified the installed Amnezia daemon's local `status` and `deactivate` API from pinned upstream source, then armed a local watchdog before each UI connection. It disconnects on repeated failed egress/HTTPS checks, always disconnects in cleanup, and has an independent unconditional timer. Recovery does not depend on internet access, GUI clicks, server changes or relaxed security controls.

The first native trial passed 9/9 pings and three rounds of DNS, Wikipedia HTTPS 200 and exit `13.50.178.121`. A second ordinary reconnect, without an extra pre-test daemon cleanup, ran for about 128 seconds: 30/30 HTTPS and expected-exit checks passed, 89/90 pings returned, and 29/30 direct Cloudflare DNS probes passed. One round had one lost ping and a two-second DNS timeout; the following round recovered and HTTPS remained successful. This did not reproduce the original loss of internet.

Server metadata confirmed a fresh handshake at 23:41:25 UTC, about 100 seconds after the second connection, with subsequent successful probes: session renewal worked. A bounded 5 MiB HTTPS download returned HTTP 200 in 1.73 seconds; this is a short transfer measurement, not a sustained throughput guarantee.

During connection, `1.1.1.1` routed through `utun8` with MTU 1280, the public VPN endpoint stayed on `en0`, and the system resolver used `1.1.1.1`/`1.0.0.1`. Both trials ended with verified daemon disconnection, the app showing Connect, and restored direct egress `5.195.76.221`. Timers are no longer armed. No server/profile credentials, protocol settings, routes outside normal app lifecycle, or persistent logging settings were changed. The earlier outage cause remains unconfirmed; do not describe this as a proven configuration fix or infer IPv6 leak protection.

Task-local protected diagnostics and the guarded test script are under `.local/diagnostics/stockholm-awg/`; source/API details are in the [Amnezia knowledge note](../.context/knowledge/amnezia.md). These are local diagnostic aids, not a background monitoring service. The Mac remains disconnected for owner-controlled practical use.

## Protected local material / owner follow-up

- `.local/keys/ghostline-poc-stockholm`: dedicated admin private key, mode 600.
- `.local/recovery/stockholm-runtime.json`: complete fresh Xray server recovery bundle, mode 600.
- `.local/recovery/stockholm-runtime.json.clients/`: `macos.json`, `ios.json`, device `.vpn` links and `*-qr.png` files. Save JSON profiles with the bundle to regenerate the same device imports.
- `.local/recovery/stockholm-awg/`: `awg0.conf`, `macos.conf`, `ios.conf`, device `.vpn` links and `*-qr.png` files. Save all three configurations.
- `.local/deployments/stockholm/`: scoped outputs, initial lifecycle evidence, pinned host trust and runtime image archives. These are ignored local artifacts.

Anthony intermediates LastPass saves. Suggested item names: `Ghostline Stockholm — SSH admin key`, `Ghostline Stockholm — Xray recovery and clients`, and `Ghostline Stockholm — AWG recovery and clients`. Local protected plaintext files are not an encrypted vault backup; saves remain unconfirmed.

For iOS, open the Xray and AWG `ios-qr.png` files locally and scan with Amnezia's importer; alternatively transfer each `ios.vpn` file. Keep device peers separate and retain Cape Town profiles. [Runtime workflow](runtime.md), [park/redeploy/destroy commands](development.md#on-demand-regional-lifecycle).

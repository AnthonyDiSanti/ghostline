# Mac VPN sleep/wake stability

Investigated 2026-09-13 after Anthony reported three to five configd crashes, prolonged beach balls and hard restarts. **Three preserved incidents confirm a recurring configd watchdog/network-lock failure around sleep/wake, with the Xray/REALITY local path present in all three and direct Amnezia service involvement in two captured lock chains.** The exact faulty operation and complete lock cycle remain unresolved. Anthony installed OneXraySE through Homebrew after App Store authentication failed. Both regional REALITY nodes now pass awake native connectivity with full-device routing configured; repeated sleep/wake stability remains untested.

## Final client selection notes

Notebook closeout — 2026-09-13. These conclusions consolidate the research below and the [focused v2rayN assessment](v2rayn-assessment.md). Earlier provisional recommendations in the investigation history are superseded by this comparison. Anthony's current scope remains replacing REALITY while keeping AWG in Amnezia, preserving the deployed server/image and existing credentials.

| Candidate | Why choose it | Remaining tradeoff and first check |
| --- | --- | --- |
| **OneXray — Codex's recommended first trial** | GPL app source, Xray and Apple Packet Tunnel integration; best fit for the open-source preference and current REALITY-only scope. No provider push channel identified in the bounded source review. | Smaller Apple adoption and a recent UI redesign; no documented AWG support. Confirm the installed engine and full-tunnel DNS/routing. Prefer the App Store edition for local access/error file logs; Homebrew's `onexrayse` installs a different System Extension edition without those file logs. |
| **Streisand — immediate alternative, also a reasonable first choice** | Current advertised Xray and stronger Apple adoption evidence than OneXray. A sensible stopgap if Anthony prioritizes established Apple distribution over source availability. No Happ-like provider management was documented. | No published app source found and no documented AWG support. Anthony explicitly accepts ads/tracking: do not reopen that as a blocker. Confirm actual Mac usability, existing-profile compatibility and sleep/wake behavior; App Store ratings combine platforms. |
| **v2rayN — strongest candidate if one app for both protocols becomes the priority** | GPL app source, broad ecosystem and supported Xray/Mihomo engines. Local profiles require no provider account; no provider push channel found in the scoped review. | Use Xray for REALITY and Mihomo for AWG 3.1; Mihomo's REALITY marker fails our preserved version floor by source analysis. Custom AWG conversion is untested. Mac TUN keeps the sudo password in app memory; its Mihomo controller is unauthenticated on localhost. These local controls differ from Happ's vendor/provider push model, but add trust and configuration tradeoffs. Use a fixed current release and inspect generated settings. |

**What would change the order:** try Streisand promptly if OneXray's distributed build cannot preserve our profile or gives poor Mac behavior; do not turn the stopgap into a custom-client build or change the server for it. Promote v2rayN if consolidating AWG is worth its extra engine/control setup. Open source makes review possible, adoption indicates project interest, and Apple integration changes the network lifecycle; none proves security or sleep reliability. No candidate has a local stability pass, and we have not established which is objectively least likely to crash.

**Next evidence:** select the app/edition, verify the packaged engine and import the existing Stockholm identity as a local profile. Check full-device routing, expected exit, DNS/IPv6 handling and clean disconnect/reconnect, then coordinate repeated sleep/wake tests with Anthony and inspect new reports. Keep one tunnel active and avoid forced sleep or the retired raw Amnezia socket watchdog. A working candidate ends the comparison for this stopgap; revisit research only for a concrete failure or changed requirement.

SFM remains removed because of the demonstrated REALITY version mismatch; Happ remains withdrawn over provider-driven configuration. They are not pending candidates. No change to the iPhone, Cape Town, server image or AWG client is part of this notebook closeout.

Anthony subsequently rejected local Amnezia patching after the [triage assessment](#amnezia-patch-feasibility), requested upstream checks between major work units, and installed OneXraySE through Homebrew. See [current configuration evidence](#onexrayse-regional-configuration); the App Store installation guidance below is historical.

### OneXray installation handoff

Recommendation reconfirmed 2026-09-13: install the free **OneXray by Yuan Dev LLC** from the [Mac App Store](https://apps.apple.com/us/app/onexray/id6745748773?platform=mac). The listing currently offers 26.9.1; verify the actually installed version/core before importing credentials. [Official installation guidance](https://onexray.com/docs/install/) distinguishes the store's Packet Tunnel app extension from OneXraySE's System Extension. Prefer the store edition for this trial, including its local diagnostic-file capability; do not enable routine access logging.

1. Open the linked listing on the Mac, choose Get/Install, then open OneXray. Complete any Apple account authentication locally.
2. Allow OneXray's macOS VPN configuration request when presented. Leave automatic/on-demand connection disabled for the initial setup and keep Amnezia disconnected when testing OneXray.
3. Import the existing Stockholm REALITY identity as a local profile, select full-device routing and verify DNS/IPv6 behavior before relying on it. The current UI advertises **All via VPN**; inspect the generated configuration because a server-link import does not preserve the former client's routing/DNS policy. No subscription service or replacement server is needed.

This is installation guidance, not evidence of an installed app, imported profile or passing tunnel. Subsequent awake and coordinated sleep/wake validation follows the criteria above. AWG stays in Amnezia.

**Installation blocker — 2026-09-13:** Anthony's 20:24 screenshot shows the App Store authorization sheet with OneXray/account details and Cancel, but no Touch ID/password/approval controls. `/Applications/OneXray.app` is absent. By live inspection the store had returned to Updates, so the missing controls were observed in the screenshot, not reproduced. Infer incomplete App Store authentication UI; the screenshot does not establish the cause or a OneXray defect. Suggested owner check: try Touch ID, then if unresponsive cancel/quit the store and retry with purchase-specific Touch ID disabled and Apple Account password authentication retained. [Apple authentication guidance](https://support.apple.com/en-us/119848). Do not disable password requirements or sign out of iCloud. No settings changed and no successful retry recorded. Screenshot remains in the owner's private `~/Documents/Screenshots/` folder; account details are not copied into the notebook.

**Retry outcome:** Anthony disabled Touch ID for both App Store purchases and Apple Pay and restarted App Store; the same empty prompt persisted. He re-enabled both options. Do not repeat that toggle as an untried fix. Read-only recent unified logs, inspected through fixed templates/redacted summaries, include artwork-loader decoding errors and `coreauthd` unsupported-companion messages; neither establishes the blank-sheet cause. A matching [first-person report](https://discussions.apple.com/thread/256033487) also persisted with Touch ID off; this is community corroboration, not an Apple-confirmed diagnosis. No account, Keychain, fingerprint, network or system-service reset was performed.

Next proposed bounded check: one full Mac restart, with the VPN disconnected, to include background services in the retry; [Apple's troubleshooting guide](https://support.apple.com/en-us/102331) recommends restart for download failures. Anthony confirms he is using the built-in keyboard, so the external Magic Keyboard hypothesis does not apply. A restart is not a verified fix. If the store remains blocked, the supported [Homebrew OneXraySE distribution](https://formulae.brew.sh/cask/onexrayse) avoids this installation channel, with the extension/logging tradeoff recorded above. Edition switch/install remains unperformed.

**Owner resolution:** Anthony declined restarting the Mac because it is expensive/disruptive and installed OneXraySE through Homebrew. Stop App Store troubleshooting for this trial. Do not require a reboot or revisit it as a routine prerequisite; report a concrete unavoidable OS requirement if one arises.

## OneXraySE regional configuration

Observed 2026-09-13: OneXraySE **26.9.2, build 444**, bundle `net.yuandev.onexray.se`, reports **Xray-core 26.9.9**. Its signed network extension `net.yuandev.onexray.se.tun` is activated/enabled. Anthony authorized configuring Stockholm and Cape Town; scope remains Mac REALITY, retaining AWG in Amnezia and all deployed server settings.

| Imported local node | Endpoint | Identity verification |
| --- | --- | --- |
| Ghostline Stockholm REALITY | `51.20.163.146:443` | Matches current ECS Mac export |
| Ghostline Cape Town REALITY | `16.28.130.178:443` | Matches the historical Mac `last_config`, both-client server bundle and a UUID distinct from the preserved iPhone profile |

Imported standard VLESS links through Servers → Add server → Import file. The first legacy JSON-outbound import was rejected with `no valid outbound found`; the link importer succeeds for both nodes. Read-only database verification confirms endpoint, UUID, Vision flow, REALITY public key, short ID, SNI and fingerprint remain equivalent. The current engine serializes VLESS fields flat and the REALITY public key as `password`; account for these schema names when comparing exports. No subscription or admin SSH material was imported.

**Expert mode versus Advanced:** the Connect screen's [Expert mode](https://onexray.com/docs/connect/#expert-mode) selects a complete [Raw JSON configuration](https://onexray.com/docs/connect/raw-json/) instead of the normal node/Smart/Custom workflow; normal choices are retained for switching back. OneXray still manages the platform tunnel, logging/metrics, file paths and some DNS options, so Raw JSON is not executed completely unchanged. The separate [Advanced sidebar](https://onexray.com/docs/advanced/) holds tunnel/DNS/IPv6 and Xray settings in either mode. Keep normal mode + All via VPN for the current validated profiles; consider Raw JSON if Ghostline later generates complete client routing/DNS configurations. This explanation did not change client settings.

CUA's AX actions can leave Flutter controls unchanged. Use a fresh screenshot and coordinates where necessary. Raise the native file picker and press Return after the selected file's Open button is enabled. A first incomplete picker attempt appeared to leave the import busy; a two-second process sample showed an idle main event loop, not evidence of a system deadlock. No app/OS restart or forced sleep occurred.

Private source-derived imports are `.local/recovery/onexrayse/ghostline-reality-{nodes.json,links.txt}`, mode 0600 in a 0700 directory. Protected post-import SQLite backup, stack sample and nonsecret equality results are under `.local/diagnostics/onexrayse-2026-09-13/`. Keep all original recovery files; no cloud secret retrieval or mutation was needed.

**Configured and validated:** Anthony explicitly approved full-device routing, encrypted DNS and native connect/disconnect tests after the initial automatic-review block. Saved **All via VPN**, a fixed Stockholm node, **Capture all traffic**, and **DNS over TLS** to `8.8.8.8` / `dns.google`. IPv6 remains off. Retained the documented system exceptions for local networks, cellular services, Apple push notifications and connected-device communication; these are distinct from Smart Routing rules. Always-on/on-demand and connect-after-launch remain off. See [Apple settings](https://onexray.com/docs/advanced/apple/) and [first connection](https://onexray.com/docs/getting-started/).

The first connection reported `NEConfigurationErrorDomain` code 10 / `NEVPNErrorDomain` code 5, permission denied. Anthony confirmed accidentally choosing Don't Allow. Retrying the app's connection button and allowing the macOS prompt registered the VPN and connected successfully, without a reboot or preference reset.

| Native check — 2026-09-13 | Result |
| --- | --- |
| Stockholm initial connection and later reconnect | HTTPS 200; exact exit `51.20.163.146` |
| Cape Town connection between Stockholm trials | HTTPS 200; exact exit `16.28.130.178` |
| General traffic and configured DNS-server route, both regions | `1.1.1.1` and `8.8.8.8` route through `utun7` |
| Fresh OS DNS lookup and encrypted-resolver reachability, both regions | Unique uncached hostname resolved; certificate-verified TLS 1.3 connection to `8.8.8.8:853` / `dns.google` succeeded |
| Disconnect after each of three connections | Supported macOS VPN stop succeeded; direct exit `5.195.76.221` and `en0` routing restored |
| Final state | Stockholm selected, All via VPN, disconnected; direct HTTPS 200 |

The DNS checks establish working native resolution, the resolver's tunnel route and TLS reachability; they are not a packet-capture audit of every OS/application query. With encrypted DNS configured, `scutil --dns` did not display an ordinary global nameserver and retained the scoped Wi-Fi resolver; that display alone neither proves a DNS leak nor an absent working resolver. Literal IPv6 HTTPS failed both connected and disconnected, so the current network cannot establish IPv6 leak prevention. Recheck on an IPv6-capable network before claiming it.

For these tests, `scutil --nc list` identified the OneXraySE service and `scutil --nc stop <service-id>` reliably disconnected it. Bounded native probes invoke that supported command in `finally`; no Amnezia daemon socket was used. Rediscover the service ID after any reinstall. Sandboxed curl cannot access the native resolver in this environment and produced misleading DNS failures; actual pass/fail evidence comes from authorized native execution outside that command sandbox.

Private probe results are under `.local/diagnostics/onexrayse-2026-09-13/`: `stockholm-native.json`, `cape-town-native.json`, `stockholm-reconnect.json` and per-stage/final disconnected checks. No new relevant `.ips` crash reports appeared in the two DiagnosticReports directories during the awake trial. No sleep or restart was forced. **Configuration and awake connectivity are complete; practical use and repeated owner-coordinated battery/AC sleep/wake cycles remain the stability acceptance.** Keep AWG in Amnezia and only one tunnel active.

## Observed incidents

Installed macOS: 26.6.2 (25G83), Apple Silicon. Amnezia package: 5.0.1.5; Info.plist reports version 5.0.1, build 5. All three configd reports use this macOS build. Times below are Dubai local time (UTC+04). Panic times come from the panic's `Epoch Time / Calendar`, not its later filename/report timestamp.

| Date | Full wake | configd watchdog report | Kernel panic |
| --- | --- | --- | --- |
| September 9 | 10:56:41 | 10:57:42 | 10:59:42 |
| September 10 | 10:33:50 | 10:34:53 | 10:36:53 |
| September 13 | 12:51:52 | 12:53:02 | 12:55:05 |

Each watchdog report identifies `IPConfigurationAgentQueue` as unresponsive after 60 seconds without a successful check-in. Each panic identifies configd as the service missing check-ins for 180 seconds. The panic is raised by watchdogd; the other listed monitored services are still checking in. The three reports show display state OFF and the Xray-path `tun2socks` process present. This is more specific evidence than a generic application crash or internet outage.

Protocol attribution rechecked against Amnezia 5.0.1.5 source: only its Xray protocol implementation launches `tun2socks`; AWG inherits the distinct WireguardProtocol/LocalSocketController path. The process is present in the September 9, 10 and 13 watchdog stackshots, with approximate uptimes of 9,200, 180 and 22,000 seconds respectively. This strongly supports Xray/REALITY involvement in every preserved system panic. The snapshots do not directly record the selected profile, and an orphaned process cannot be excluded; available app/unified logs do not provide an independent connection-state record. Do not claim absolute proof of the active protocol or of every owner-reported incident. No AWG-only sleep/watchdog panic was identified. The later AWG test-cleanup service SIGSEGV is a separate failure class.

Sleep notification failures precede the full wakes. The first recorded IPConfiguration timeout on each incident day follows a return to sleep by about 28 seconds: September 9 at 09:55:14, September 10 at 10:33:01, and September 13 at 07:06:07. Today the stall was visible during background sleep cycles hours before the visible failure after wake. Do not assume it starts only when the lid opens or only during an explicit lid-close event.

Today's panic was followed by powerd startup at 12:57:11. Anthony then let startup items launch, resumed the agent and removed items he no longer needed. That cleanup is post-restart activity and cannot be the initiating cause of the already-recorded 12:55 panic. It changes the baseline for future comparisons; no complete inventory of removed items was collected.

## Direct lock evidence and limits

The September 13 configd queue, thread 2321764, waits for a kernel mutex owned by thread 2315063 in `AmneziaVPN-service`. That Amnezia thread is in an uninterruptible wait for a kernel read/write lock. September 9 shows the same pattern with different thread IDs. September 10's immediate mutex owner is a kernel worker, with many Amnezia threads waiting on that same networking lock chain.

This establishes direct participation in the blocked network path, rather than merely observing Amnezia in a process list. The read/write lock owner is not exposed in the selected `waitInfo`; the local evidence does **not** reconstruct a complete cycle or identify which side violates lock ordering. Distinguish a highly likely Amnezia/macOS interaction from a proven single-line Amnezia defect or an exclusively Apple defect.

Snapshots show substantial thread accumulation: Amnezia service counts of 25/210/134 and tun2socks counts of 1219/109/248 across the three incidents. These are observations, not proof of a memory/thread leak causing the hang; blocked threads can also accumulate as a consequence. Panic records report compressor and swap space OK, and the recorded panic cause is the configd watchdog.

The reviewed 5.0.1.5 source connects wake/network-change notifications to reconnect handling. Xray stop performs synchronous privileged IPC for network/resolver/tunnel teardown. That is relevant context, but the stackshots do not prove a particular call in that method caused the kernel lockup. See [connection handling](https://github.com/amnezia-vpn/amnezia-client/blob/5.0.1.5/client/vpnconnection.cpp) and [Xray stop](https://github.com/amnezia-vpn/amnezia-client/blob/5.0.1.5/client/core/protocols/xrayProtocol.cpp).

## Upstream corroboration

- [Amnezia issue #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933) reports a sleep-related kernel-network deadlock involving the Amnezia service, configd's same queue and the Xray/VLESS path. It is a close match to our observations, although its author's complete lock-cycle reconstruction is not independently established for our machine. The issue remains open at review time.
- [Issue #2897](https://github.com/amnezia-vpn/amnezia-client/issues/2897) reports a related watchdog panic on another Mac; [#3042](https://github.com/amnezia-vpn/amnezia-client/issues/3042) reports a distinct Xray GUI crash after wake on our macOS/app versions. Similar symptoms need not have identical causes.
- The [latest published Amnezia release](https://github.com/amnezia-vpn/amnezia-client/releases/tag/5.0.1.5) is already our installed 5.0.1.5. No verified fixed release or applicable maintainer patch was identified. This is not evidence that no unreleased fix can exist.

## Amnezia patch feasibility

Triage only — 2026-09-13, requested by Anthony; no new code tracing, build or reproduction. Amnezia publishes its application under [GPL-3.0](https://github.com/amnezia-vpn/amnezia-client#license). The starting point is [#2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), still open/unassigned, with five community comments and no maintainer response or matching fix PR identified in the scoped search. Current published release remains 5.0.1.5.

Read [HeisLuka's September 9 analysis](https://github.com/amnezia-vpn/amnezia-client/issues/2933#issuecomment-5608274317) alongside the [newer desktop report](https://github.com/amnezia-vpn/amnezia-client/issues/2933#issuecomment-5604223275). They broaden the proposed fault domain beyond sleep: Xray/tun2socks and macOS virtual-interface/network changes. The analysis proposes bounded firewall commands, stopping packet processing before dependent cleanup, explicit sleep/wake lifecycle handling and a controlled tunnel-engine version comparison. These are community hypotheses and candidate changes, not a maintainer-confirmed fix or a fresh independent source audit. [#3130](https://github.com/amnezia-vpn/amnezia-client/issues/3130) reports a Docker-triggered network deadlock as another related trigger.

**Codex estimate: 4/5 for a reliable fix**, where 1 is a straightforward localized change and 5 is open-ended subsystem debugging. Client-side lifecycle changes could be moderate work, but a timeout can free a waiting caller without releasing a kernel lock. A process in uninterruptible kernel wait may not exit even when killed. Preventing the original trigger and proving that we did so dominate the estimate; neither a responsive Disconnect button nor one successful wake is sufficient.

If selected, the likely work is:

1. Establish a repeatable baseline with useful lock/thread evidence and a locally buildable Mac app/helper. The [build guide](https://github.com/amnezia-vpn/amnezia-client#hacking-guide) lists Xcode tooling, Qt, CMake, Conan and submodules; local installation/signing and profile preservation need checking.
2. Isolate one plausible cause at a time: tunnel-engine dependency versus shutdown ordering, overlapping network transitions or sleep handling. Preserve kill-switch intent and correct DNS/IPv6 restoration; do not disable protections to make the experiment pass.
3. Exercise normal connect/disconnect, network changes, connection bursts, sleep/wake and AWG regressions; repeat the failing workload. If a narrow client/dependency fix explains the reproduction, the difficulty could fall toward 3/5. A macOS kernel issue without a safe client-side avoidance path could push it to 5/5.

Original triage recommendation: prefer a replacement-client trial; a one-engineering-day feasibility cap was an option only if retaining Amnezia became the priority. **Anthony subsequently rejected local patching/fork maintenance.** That investigation is not pending work. No GitHub message was posted.

## Amnezia revisit check

Owner decision — 2026-09-13: wait for upstream work and use an alternative Mac REALITY client. Upstream awake reproductions make avoiding sleep insufficient protection; pause routine REALITY use in the affected Amnezia build. This concerns its Mac Xray/tunnel integration, not proof that the REALITY protocol itself causes kernel crashes. AWG remains in Amnezia under the existing scope; no AWG-only instance of this watchdog failure has been identified.

At major work-unit transitions, including To Do reviews, check [#2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), any linked patch and [Amnezia releases](https://github.com/amnezia-vpn/amnezia-client/releases). Distinguish community progress, confirmed resolution, and inclusion in a released **macOS client build**; also note any required macOS OS update. Record date and applicable version in the [recurring task](../.context/tasks.md#recurring-mac-release-check). Last review on September 13 found the issue open, no matching fix, and current client 5.0.1.5. Do not repeat a full investigation or install a background monitor.

A released fix is a reason to reconsider the official client, not automatically switch back. Verify existing-server compatibility and repeat awake/reconnect and coordinated sleep/wake checks before returning to normal use. The potential broader benefit of an upstream fix remains a reason to revisit, not a guaranteed outcome.

## Separate service crash during prior test cleanup

Four preserved `AmneziaVPN-service` reports show the same SIGSEGV at address 0x8, with `QIODevice::readAll()` called by `DaemonLocalServerConnection::readData()`: September 9 at 03:37 and 03:41, September 12 at 20:32, and September 13 at 13:05. They are separate from the three configd watchdog panics.

Today's service crash was captured at 13:05:00.6468. Our prior AWG test wrote its final successful probe at 13:04:58.536, then slept two seconds before sending raw daemon `deactivate`. The timing and socket-read stack strongly implicate that cleanup interaction in exposing the service bug; they do not establish its exact memory-lifetime defect. It occurred after the 12:57 reboot and cannot explain the earlier system panic. The native tunnel probes and recovered direct egress passed, but those successes did not establish daemon stability.

**Retire the custom raw daemon-socket polling/deactivation watchdog for this build.** Do not re-run the ignored diagnostic scripts as a trusted recovery mechanism. Ordinary GUI control remains available for owner-authorized awake tests, without claiming that it cures either bug. A future recovery method needs validation including daemon restarts/crash reports, not just route restoration. Related upstream reports: [#2329](https://github.com/amnezia-vpn/amnezia-client/issues/2329), [#2637](https://github.com/amnezia-vpn/amnezia-client/issues/2637).

## Current client direction

Anthony’s September 13 decision: preserve the deployed official XTLS image and server settings, remove SFM, and focus on alternative REALITY clients. Keep AWG in Amnezia; consider Shadowrocket only if comparable AWG instability appears. Revisit official Amnezia when a relevant fix is available and can be validated, ideally before another client/server compatibility change forces the issue. No scheduled monitoring was installed.

Anthony rejects proprietary third-party remote administration of the client. Require owner-controlled profiles without an external provider management dependency. This is a stopgap: reliability and avoiding system crashes are the practical objective. Anthony explicitly accepts Streisand’s ads/tracking tradeoff; it is not a selection blocker. Prefer open source, then adoption among suitable clients. Prefer a maintained Apple client using NetworkExtension and a current Xray engine. Preserve the existing Stockholm UUID, REALITY keys/short ID/SNI and address. Validate the installed build’s engine and tunnel integration; a shared product name across App Store and standalone desktop packages does not establish identical internals.

Acceptance remains awake browsing/expected exit, tunneled DNS, IPv6 handling and reconnect, followed by owner-coordinated sleep/wake cycles on battery and AC with inspection of new crash reports. Compare against disconnected sleep cycles; one passing wake is insufficient for an intermittent issue. Keep only one active tunnel. Pause routine REALITY use in current Amnezia pending the fixed-build trial above; disconnecting only before sleep cannot address the reported awake triggers. No automatic sleep hook was installed.

### SFM compatibility trial and removal — 2026-09-13

**SFM means sing-box for macOS.** It provides an Apple UI and [NetworkExtension TUN](https://sing-box.sagernet.org/clients/apple/features/) over the sing-box engine. The [Homebrew cask](https://formulae.brew.sh/cask/sfm) offered official universal version 1.14.0. The package downloaded but installation stopped at owner sudo authentication; no native profile was imported.

A private profile preserving the current Mac identity passed official sing-box 1.14.0 schema validation, but two live loopback-proxy HTTPS checks failed with `reality verification failed`. These checks used localhost SOCKS without changing system VPN routes. An official Xray 26.7.28 client with the original profile succeeded against Stockholm and returned `51.20.163.146`. Decoded recovery files agreed with the client identity.

An isolated localhost-only Xray 26.7.28 server reproduced the sing-box failure with the default client-version floor. Changing only that local floor to `1.8.1` made the same sing-box client pass HTTPS. The pinned [Xray server implementation](https://github.com/XTLS/Xray-core/blob/v26.7.28/infra/conf/transport_security.go) defaults an absent/empty `minClientVer` to `26.3.27`; our preserved server config omits it. The pinned [sing-box implementation](https://github.com/SagerNet/sing-box/blob/v1.14.0/common/tls/reality_client.go) sends REALITY client-version bytes `1.8.1`, independent of its app version. [Upstream’s change](https://github.com/XTLS/Xray-core/commit/af7eb68028732a8ee3c0e5d6ab2b8a657bb2e770) and server warning associate lowering the floor with censorship-detection risk.

Generic VLESS/REALITY support was insufficient to establish compatibility; the earlier SFM recommendation should have checked the exact releases first. **The decision is resolved: no deployed floor reduction, image change, downgrade or client-version spoof for SFM.**

Removal is complete: verified no `/Applications/SFM.app`, Homebrew cask directory or package receipt; removed the cached installer, unused credential profile and headless sing-box binary/archive. All temporary client/server processes and credential configs were removed. Private diagnostic results and nonsecret release provenance remain under `.local/diagnostics/sfm-trial-2026-09-13/`, including `sfm-cleanup.json`. The verified Xray control binary remains in `.local/tools/xray-26.7.28/`. No native VPN/power setting, cloud resource or deployed configuration changed; no sleep was forced.

For future reconsideration, [official sing-box 1.14.0 WireGuard options](https://github.com/SagerNet/sing-box/blob/v1.14.0/option/wireguard.go) have no AmneziaWG obfuscation fields. Standard WireGuard or a third-party sing-box fork does not establish official AWG 3.1 support. Also distinguish MacPorts’ command-line sing-box package from SFM: its [Portfile](https://raw.githubusercontent.com/macports/macports-ports/master/net/sing-box/Portfile) declares `nomaintainer` and does not package the Apple UI; its version lag alone does not show upstream neglect of macOS.

### Alternative-client assessment — 2026-09-13

| Candidate | Relevant evidence | Assessment |
| --- | --- | --- |
| **Happ, Apple App Store build** | [Apple listing](https://apps.apple.com/us/app/happ-proxy-utility/id6504287215): free, macOS 12+, VLESS/REALITY; version 5.7.0. Release 5.5.0 explicitly updated Xray to 26.7.28. | Recommendation withdrawn: published engine compatibility is outweighed by its provider-management model under Anthony’s requirements. No installed/local validation or exposure occurred. |
| **Streisand** | [Apple listing](https://apps.apple.com/us/app/streisand/id6450534064): free, iPad app available on macOS 12+ with M1 or later; version 1.6.76 updates its core to 26.09.09. | Strong stopgap candidate under Anthony’s latest direction; ads/tracking accepted. No provider remote-management feature was established. Current engine clears the observed floor; exact Stockholm and Mac sleep behavior remain untested. |

Happ’s [official downloads](https://www.happ.su/main) include both App Store and standalone desktop distributions. Its [desktop release notes](https://github.com/Happ-proxy/happ-desktop/releases) describe an administrator-installed daemon; do not substitute that package automatically for the Apple build in this experiment. Happ’s Apple listing discloses diagnostic crash-data collection. Streisand’s store label declares no collection, but its linked policy contradicts that impression; see the assessment below. These disclosures are not an independent privacy audit. No alternative app has been installed.

### Source availability and adoption comparison — 2026-09-13

Anthony prefers open-source clients when that distinguishes candidates, then broader adoption. The initial Happ recommendation based on adoption is superseded by the remote-configuration assessment below; suitability for owner-controlled use takes precedence.

- **Happ:** its [developer explicitly says the application source is private](https://github.com/XTLS/BBS/issues/8#issuecomment-3608156866) because it is a commercial product. The public [Apple repository](https://github.com/Happ-proxy/happ-ios) contains only a README; the desktop repository contains documentation/releases, not buildable app source. An open-source Xray engine does not make the surrounding client open source.
- **Streisand:** no published app source or open-source app license was found through its [official site](https://streisand.pages.dev/) and linked resources; they link Xray and configuration examples. Its [terms](https://streisand.pages.dev/legal/tos/) point to Apple’s standard EULA. Do not label it open source based on third-party descriptions or confuse it with the unrelated StreisandEffect server-provisioning project.
- **Adoption proxy:** the linked US Apple listings show Happ about 15,000 ratings at 4.6/5 and Streisand about 2,100 at 4.4/5. This favors Happ as the broader-adoption experiment, but measures neither installs/active users nor Mac-only experience; do not claim seven times as many users or proven sleep stability.
### Happ remote-configuration assessment — 2026-09-13

Anthony rejects remote control of the client. Codex withdraws the Happ recommendation: adoption and engine compatibility do not resolve this mismatch. Happ was never installed and no Ghostline credentials were given to it. Do not automatically promote Streisand without checking the same client-control criteria.

- Happ’s [developer statement](https://github.com/XTLS/BBS/issues/8#issuecomment-3610962174) says its provider-oriented push mechanism sends a device HWID/push token and allows changing subscription URLs or application settings without user intervention. This establishes remote application configuration, not evidence of arbitrary commands, remote desktop or an inbound administration port.
- The [application-management documentation](https://github.com/HappDev/happ_su/blob/main/dev-docs/app-management.md) separately describes subscription-delivered settings, including URL replacement, auto-connect, routing exclusions and a parameter preventing users from disabling HWID forwarding. Advanced features require Provider ID. Do not assume every documented subscription setting is reachable by every push message or applies to local-only profiles.
- [Provider ID documentation](https://github.com/HappDev/happ_su/blob/main/dev-docs/provider-id.md) describes linking a subscription to a provider account and daily backend requests containing a provider ID, subscription-domain hash, device HWID and OS details. This supports a managed subscription product model; it is unnecessary for our owner-managed endpoints.
- The current [privacy policy](https://github.com/HappDev/happ_su/blob/main/privacy-policy.md) says iOS push-token collection requires notification consent and describes settings to disable HWID in subscription requests. That does not verify the Mac build’s behavior or disablement of every management channel. The previous blanket description of the feature as optional was too confident. A local-only profile’s exact exposure remains untested; the unrelated allegation of subscription exfiltration is not established by these sources.

Next: screen candidate clients for owner-controlled configuration and absence of an unwanted vendor/provider management dependency, then confirm existing-server compatibility and Apple tunnel integration before installation. Preserve the server/image; keep AWG in Amnezia under the existing scope.

### Streisand review — 2026-09-13

The initial Codex recommendation to defer Streisand over its disclosures is **superseded by Anthony’s explicit acceptance of ads/tracking for this stopgap**. Streisand remains a strong candidate. Keep the findings below as evidence limits, not new acceptance gates. No app installation, credential import, traffic capture or native test occurred during this source/document review.

- **Privacy discrepancy:** the US App Store label says no data is collected. Following that listing’s privacy link through `/privacy-policy/` leads to the developer’s [current policy](https://streisand.pages.dev/legal/pp/), which describes crash reports, usage/screen/feature analytics, device model and OS, retained for 90 days, plus Google AdMob advertising. The policy separately says VPN traffic is not collected. Distinguish that narrower statement from no telemetry; neither text establishes what the exact Mac build sends or whether telemetry/ads can be disabled. Do not infer malicious intent or a measured leak from inconsistent disclosures alone.
- **Remote configuration:** reviewed the official site, policy, terms, partner page and changelog. No Happ-like provider push/settings API was documented in those sources. This is a documentation-search result, not proof of absence. The XTLS discussion’s separate claim about Streisand backend requests lacks sufficient app-version/payload evidence to establish remote administration or subscription exfiltration. No published buildable client source or open-source app license was found; Xray and the linked configuration-example repository are separate projects.
- **Compatibility and maintenance:** the App Store reports 1.6.76/core 26.09.09 and availability on Apple Silicon Macs. The [website changelog](https://streisand.pages.dev/changelog/) still ends at 1.6.75/core 26.07.11; use release-specific evidence rather than assuming documentation freshness. Both advertised engine versions exceed Stockholm’s observed 26.3.27 floor, but native connection/privacy/sleep behavior is untested. About 2,100 US Apple ratings are a platform-combined adoption proxy.
- **Name:** a reference to the Streisand effect is a plausible inference, not a developer-confirmed naming explanation. The term describes suppression drawing more attention, originating in Barbra Streisand’s attempt to suppress a coastal photograph including her home; [the person who coined it explains the history](https://www.techdirt.com/2023/11/14/turns-out-barbra-streisand-is-aware-of-the-streisand-effect-but-seems-confused-about-it/). Do not confuse this Apple app with the older StreisandEffect server-provisioning project.

Anthony requested one final bounded search for a stronger alternative while retaining Streisand. Do not turn the accepted tracking tradeoff into an audit prerequisite or infer remote administration merely from closed source. Results follow.

### Final search and stopgap recommendation — 2026-09-13

The [XTLS client directory](https://github.com/XTLS/Xray-core#gui-clients), current releases, store listings and selected code produced two relevant alternatives. Recommendation by Codex: **give OneXray’s Apple App Store build a short trial first; retain Streisand as the immediate next choice**. OneXray improves source transparency and exposes the desired Apple integration. This is not evidence that it will outlast Streisand during sleep/wake, nor owner selection of a new app.

Adoption snapshots: OneXray's US App Store listing had about 55 ratings at 3.9/5 versus Streisand's approximately 2,100 at 4.4/5; v2rayN had about 116k GitHub stars. These are different measures and none establishes Mac-only installs or sleep reliability. The [final comparison](#final-client-selection-notes) incorporates the subsequent AWG and v2rayN findings.

**OneXray evidence:** [App Store](https://apps.apple.com/us/app/onexray/id6745748773) reports 26.9.1; GitHub has [26.9.2](https://github.com/OneXray/OneXray/releases/tag/v26.9.2). Do not conflate them. The reviewed [26.9.1 entitlements](https://github.com/OneXray/OneXray/blob/v26.9.1/macos/tunnel/tunnel.entitlements) enable the sandboxed Apple packet-tunnel provider; [notification code](https://github.com/OneXray/OneXray/blob/v26.9.1/lib/service/shared/notification/service.dart) emits local alerts, not remote provider pushes. These files match 26.9.2. Selected source/dependency searches found no provider push-registration channel; this is bounded code inspection, not an exhaustive audit or proof that store binaries match source.

Its [documented operation](https://github.com/OneXray/OneXray#first-connection) supports local imports without a vendor account. Subscription refreshes are pulls from configured sources; they need not be configured for Ghostline. Its current [policy](https://onexray.com/docs/privacy/) describes ordinary DNS, selected-server, configured-download and update requests; do not interpret it as zero network activity. The 26.9.2 per-subscription identifier is random and default-off, not a provider push controller. That new option must not be assumed present in store 26.9.1.

The Apple release history includes Xray 26.3.27, sufficient for the observed server floor, but the exact current packaged core still needs confirmation in the app before connecting. For a trial use existing credentials, local configuration, one fixed Stockholm endpoint and full-tunnel behavior; avoid Smart Routing’s direct-region defaults. Node-only import does not preserve source DNS/routing; inspect the generated config or use Raw JSON. No engine/app build or server change is needed merely to try the distributed client. Awake connectivity/reconnect and owner-coordinated sleep/wake remain the acceptance evidence.

**v2rayN evidence:** the subsequent [focused assessment](v2rayn-assessment.md) reviews Mac privileges, local/remote controls, release security and protocol compatibility. It finds a viable Xray-for-REALITY/Mihomo-for-AWG design, an app-held sudo password and a loopback Mihomo API without authentication. No Happ-like provider push channel was identified. Current Mihomo alone cannot meet our REALITY version floor. OneXray remains Codex's first recommendation for the selected REALITY-only experiment; neither networking architecture is proven immune to the observed failure.

Read-only OneXray source text is retained under ignored `.local/research/client-final-2026-09-13/`; fetched project scripts were not run. No apps, VPN profiles, credentials or cloud resources changed. The search round is complete; proceed to a bounded client trial rather than another general comparison.

### AWG support and Homebrew packaging — 2026-09-13

Follow-up research changes v2rayN's value for a possible two-protocol client: its [supported cores](https://github.com/2dust/v2rayN/wiki/List-of-supported-cores) include Mihomo, whose shipped [1.19.30 release](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.30) adds AWG 3.0 and 3.1. The [configuration reference](https://wiki.metacubex.one/en/config/proxies/wg/) exposes `amnezia-wg-option`, including v3.1 fields. v2rayN's [7.24.9 core definitions](https://github.com/2dust/v2rayN/blob/7.24.9/v2rayN/ServiceLib/Manager/CoreInfoManager.cs) support launching Mihomo configuration files on Intel and Apple Silicon Macs. This is a viable custom-configuration route, not a tested Ghostline profile import or sleep-stability pass. Preserve all AWG fields during translation; ordinary WireGuard import is insufficient evidence. No AWG support was identified in OneXray's reviewed source or Streisand's published features. Standard Xray WireGuard support does not implement AWG.

The [deeper v2rayN review](v2rayn-assessment.md#protocol-and-tunnel-design) establishes a separate limit: Mihomo 1.19.30 sends REALITY marker `1.8.2`, below Stockholm's `26.3.27` floor. Plan separate Xray/Mihomo profiles if selected; do not infer that one Mihomo engine can serve both unchanged protocols.

OneXray is available through [Homebrew](https://formulae.brew.sh/cask/onexrayse): `brew install --cask onexrayse`. This installs **OneXraySE**, the standalone System Extension edition. The [installation notes](https://github.com/OneXray/OneXray#installation-notes) distinguish its Apple packet-tunnel system extension from the App Store edition's packet-tunnel app extension; both use NetworkExtension. The README also says local access/error file logs are unavailable in SE, relevant to this diagnostic trial. Do not assume identical packaging or diagnostics between editions. Nothing was installed; Anthony's existing scope still keeps AWG in Amnezia while replacing REALITY.

[Shadowrocket](https://apps.apple.com/us/app/shadowrocket/id932747118?platform=mac) remains conditional on comparable AWG instability under Anthony’s direction. Its release notes mention AWG, but exact AWG 3.1 compatibility remains unverified. [Hiddify](https://github.com/hiddify/hiddify-app) uses sing-box; selecting another frontend does not by itself resolve the measured REALITY version-floor problem.

## Evidence handling

Original watchdog, panic, reset and Amnezia crash reports, pmset history, a scoped unified-log capture, parsed lock/timeline summaries and SHA-256 inventory are preserved under ignored `.local/diagnostics/mac-sleep-2026-09-13/` with private permissions. Raw reports contain machine/process identifiers and must stay outside git and public issue posts. Repository documentation contains only selected diagnostic facts.

Cross-checked all three watchdog/panic pairs independently: configd queue identity, mutex owner, tun2socks presence and wake-to-watchdog/panic timing. The unified-log command emitted some records outside the requested interval; `latest-bounded.ndjson` applies an explicit timestamp filter. Do not confuse post-reboot startup/cleanup activity with pre-panic events.

# Protocol selection research

Research checked 2026-09-07. The comparison below preserves the earlier evaluation; Anthony subsequently selected AmneziaWG on the same host with a separate EIP. Current scope and implementation are in [architecture](../../docs/architecture.md) and [runtime](../../docs/runtime.md). Xray migration has passed the owner checkpoint; AWG has only local disposable-peer test evidence so far.

## Selection priority

Anthony clarified that stealth/protocol quality is the important decision. The prior AmneziaWG recommendation over-weighted installer convenience and UDP diversity. Do not describe it as best-in-class without comparative evidence. The initial discussion considered a separate EC2/EIP; the selected topology now shares one EC2 host and uses separate EIPs. No second protocol has UAE test evidence in this project.

Evaluate passive traffic fingerprints, active-probe behavior, transport blocking, actual macOS/iOS implementation, and independent failure modes. A new IP helps with individual-address failure; another transport helps only for some filtering conditions. A same-provider/region alternative still shares those dependencies. Successful connectivity does not establish undetectability.

## Candidates and evidence

- **AmneziaWG:** WireGuard-derived UDP with changes to headers, lengths, padding and timing. Its cryptographic core remains WireGuard's, according to [the protocol documentation](https://docs.amnezia.org/documentation/amnezia-wg/). The project reports 3.1 responded to Russian blocking in June/July 2026. This is evidence of an active anti-censorship engineering effort, not proof of superiority in Dubai. [OTF's independent audit summary](https://www.opentech.fund/security-safety-audits/amneziavpn-security-audit-summary/) covers work in December 2024–January 2025; it neither evaluates the later 3.1 changes nor establishes a comparative stealth ranking.
- **NaïveProxy:** Reuses Chromium's network stack, HTTP multiplexing and padding, with an ordinary web frontend to handle unauthenticated requests. A strong design rationale for web-traffic camouflage; its authors' resistance claims are not independent comparative measurements. Prefer considering HTTP/2 over TLS/TCP 443 for the stealth-first experiment. Requires a domain, trusted certificate and compatible full-device client setup. [Upstream design](https://github.com/klzgrad/naiveproxy).
- **Hysteria 2:** QUIC-based transport with HTTP/3 server behavior for unauthenticated requests, offering a UDP alternative to current TCP/REALITY. Default HTTP/3 camouflage and optional random-byte obfuscation are different strategies: enabling Salamander disables ordinary HTTP/3 interoperability. UDP reachability/throttling must be tested on the actual networks. [Protocol](https://hysteria.network/docs/developers/Protocol/), [configuration tradeoff](https://hysteria.network/docs/advanced/Full-Server-Config/).

General evidence: [USENIX Security 2023 research](https://www.usenix.org/conference/usenixsecurity23/presentation/wu-mingshi) measured Chinese filtering of fully encrypted TCP traffic. It demonstrates why random-looking encryption is not a universal stealth strategy; it is not a direct test of current AmneziaWG/QUIC or UAE filtering.

## Earlier recommendation and practical constraint

The earlier recommendation was to investigate NaïveProxy first for stealth and Hysteria 2 for UDP/performance diversity. Anthony subsequently chose AmneziaWG after discussing its independent runtime and client support. No universal or UAE-specific winner was established by the consulted sources.

[sing-box Naive outbound](https://sing-box.sagernet.org/configuration/outbound/naive/) documents Apple support since 1.13.0 and links Chromium-derived runtime integration. However, [Apple client distribution](https://sing-box.sagernet.org/clients/apple/) currently reports App Store update trouble and sponsor-gated TestFlight. Verify the actual obtainable build, full-device routing and UDP/DNS handling before claiming an iPhone-ready solution. A generic HTTPS proxy or client claiming Naive compatibility does not by itself demonstrate the intended Chromium behavior. No sponsorship, client purchase or installation is authorized by this research.

## Independence from AmneziaVPN orchestration

AmneziaWG does not require the AmneziaVPN installer/manager. Upstream provides an independently runnable [userspace implementation](https://github.com/amnezia-vpn/amneziawg-go), a [Linux kernel module](https://github.com/amnezia-vpn/amneziawg-linux-kernel-module), and [configuration tools](https://github.com/amnezia-vpn/amneziawg-tools) (`awg`, `awg-quick`). The [standalone client](https://docs.amnezia.org/documentation/instructions/use-amneziawg-app/) imports native configuration files. Our deployment can own versioned runtime artifacts, secrets, peers, routing/NAT, service lifecycle and profile generation without AmneziaVPN setup or a subscription.

That removes the orchestration dependency, not the dependency on compatible AmneziaWG implementations and protocol maintenance. Ordinary WireGuard clients cannot use enabled AmneziaWG obfuscation; server/tools/client protocol generations must match. Containerization is feasible as an implementation direction, with host networking/TUN or kernel-module requirements to design explicitly. Existing profiles can survive a management change only when server identity, endpoint and compatible parameters are preserved. The portability finding informed the subsequent AmneziaWG selection; it does not by itself demonstrate Apple client interoperability or UAE connectivity.
